const express = require("express");
const multer = require("multer");
const fs = require("fs");
const csv = require("csv-parser");
const path = require("path");
const {
  analyzeRfp,
  extractLineItems,
  chooseBestSku,
  generateProposalHtml,
} = require("./ai");
const puppeteer = require("puppeteer");
const HTMLtoDOCX = require("html-to-docx");

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(express.static("public"));
app.use(express.json());

// -- MANUAL CORS MIDDLEWARE --
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*"); // Allow any origin
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// --- IN-MEMORY DATA ---
let skus = []; // { id, skuCode, name, description, category, baseCost }
let rfps = []; // { id, ...data }

// --- API ENDPOINTS ---

// 1. Upload SKU CSV
app.post("/api/skus/upload-csv", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const results = [];
  fs.createReadStream(req.file.path)
    .pipe(csv())
    .on("data", (data) => {
      // Map CSV columns to our schema (handle loose naming)
      const sku = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        skuCode: data.skuCode || data["SKU Code"] || data.id || "UNKNOWN",
        name: data.name || data["Name"] || data["Product Name"] || "",
        description: data.description || data["Description"] || "",
        category: data.category || data["Category"] || "",
        baseCost: parseFloat(
          data.baseCost || data["Base Cost"] || data["Cost"] || 0
        ),
      };
      results.push(sku);
    })
    .on("end", () => {
      skus = results;
      // Cleanup temp file
      fs.unlinkSync(req.file.path);
      res.json({
        message: `Successfully loaded ${skus.length} SKUs`,
        count: skus.length,
      });
    })
    .on("error", (err) => {
      res.status(500).json({ error: "Failed to process CSV" });
    });
});

// 2. Analyze RFP Text
app.post("/api/rfp/analyze", async (req, res) => {
  try {
    const { rfpText } = req.body;
    if (!rfpText)
      return res.status(400).json({ error: "No RFP text provided" });

    // 1. Analyze high-level details
    const details = await analyzeRfp(rfpText);

    // 2. Extract line items
    const rawLineItems = await extractLineItems(rfpText);

    // Create new RFP object
    const rfpId = Date.now().toString();
    const newRfp = {
      id: rfpId,
      ...details,
      rawText: rfpText,
      lineItems: rawLineItems.map((item, index) => ({
        id: `${rfpId}-L${index}`,
        ...item,
        matchedSkuId: null,
        matchConfidence: null,
        unitPrice: null,
        totalPrice: null,
      })),
    };

    rfps.push(newRfp);
    res.json(newRfp);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Analysis failed" });
  }
});

// --- HELPERS ---

function tokenize(text) {
  return (text || "").toLowerCase().match(/[a-z0-9]+/g) || [];
}

function getSkuCandidatesForText(text, limit = 5) {
  const tokens = new Set(tokenize(text));
  if (tokens.size === 0) return skus.slice(0, limit);

  const scored = skus.map((sku) => {
    const skuTokens = tokenize(
      `${sku.name} ${sku.description} ${sku.category} ${sku.packSize}`
    );
    let score = 0;
    skuTokens.forEach((t) => {
      if (tokens.has(t)) score++;
    });
    return { sku, score };
  });

  // Sort by score desc
  scored.sort((a, b) => b.score - a.score);

  // Filter those with at least 1 match, or fallback to generic top list if strictness is too high
  // But for now, let's return top scorers even if score is low, to valid "no match"
  // Better: only return score > 0. If none, return empty (so AI says "no match") or return generic?
  // AI needs candidates to "reject". If we send nothing, it can't choose.
  // So let's send top `limit` regardless, but useful ones first.
  return scored.slice(0, limit).map((s) => s.sku);
}

// 3. Match SKUs for an RFP
app.post("/api/rfp/:id/match", async (req, res) => {
  try {
    const rfpId = req.params.id;
    const rfp = rfps.find((r) => r.id === rfpId);
    if (!rfp) return res.status(404).json({ error: "RFP not found" });

    // Parallel matching
    const tasks = rfp.lineItems.map(async (item) => {
      // 1. Get Candidates
      const candidates = getSkuCandidatesForText(item.description, 5);

      // 2. Call AI
      const matchResult = await chooseBestSku(item, candidates);

      // 3. Update Item
      if (matchResult.chosenSkuCode) {
        const sku = skus.find((s) => s.skuCode === matchResult.chosenSkuCode);
        if (sku) {
          item.matchedSkuId = sku.id;
          item.matchedSku = sku; // Persist for frontend
          item.matchConfidence = matchResult.confidence;
          item.rationale = matchResult.rationale;
        } else {
          // AI picked a code that doesn't exist (shouldn't happen with strict prompt)
          item.matchedSkuId = null;
          item.matchedSku = null;
        }
      } else {
        item.matchedSkuId = null;
        item.matchedSku = null;
      }
      return item;
    });

    await Promise.all(tasks);

    // Return the updated RFP (or just line items)
    res.json(rfp);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Matching failed" });
  }
});

// 4. Generate Proposal
app.post("/api/rfp/:id/generate", async (req, res) => {
  try {
    const { marginPercent = 20 } = req.body;
    const rfp = rfps.find((r) => r.id === req.params.id);
    if (!rfp) return res.status(404).json({ error: "RFP not found" });

    // ENRICH DATA HERE (Prevent AI Hallucination)
    const enrichedLineItems = rfp.lineItems.map((li) => {
      const sku = skus.find((s) => s.id === li.matchedSkuId);

      let finalUnitPrice = null;
      let finalTotalPrice = null;
      let skuCode = null;
      let skuName = null;

      if (sku) {
        skuCode = sku.skuCode;
        skuName = sku.name;

        const cost = sku.baseCost;
        const price = cost * (1 + marginPercent / 100);
        const qty = li.quantity || 1;

        finalUnitPrice = price.toFixed(2);
        finalTotalPrice = (price * qty).toFixed(2);
      } else {
        // Explicitly null if no match, so AI sees it's missing
        finalUnitPrice = null;
        finalTotalPrice = null;
      }

      return {
        description: li.description,
        quantity: li.quantity,
        unit: li.unit,
        notes: li.notes,
        skuCode: skuCode,
        skuName: skuName,
        unitPrice: finalUnitPrice,
        totalPrice: finalTotalPrice,
      };
    });

    const html = await generateProposalHtml(
      {
        id: rfp.id,
        name: rfp.name,
        buyerName: rfp.buyerName,
        deadline: rfp.deadline,
        summary: rfp.summary,
        keyRequirements: rfp.keyRequirements,
      },
      enrichedLineItems,
      marginPercent
    );
    rfp.proposalHtml = html;

    res.json({ html });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Generation failed" });
  }
});

// 5. Download PDF
app.post("/api/rfp/:id/download/pdf", async (req, res) => {
  try {
    const rfp = rfps.find((r) => r.id === req.params.id);
    if (!rfp || !rfp.proposalHtml) {
      console.error(
        "PDF Download: RFP not found or no HTML for ID:",
        req.params.id
      );
      return res.status(404).json({ error: "Proposal not found" });
    }

    console.log(
      `Generating PDF for RFP ${rfp.id}. HTML length: ${rfp.proposalHtml.length}`
    );

    // Wrap in standard HTML for better rendering
    const fullHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; margin: 40px; }
          table { width: 100%; border-collapse: collapse; }
          th, td { border: 1px solid #ddd; padding: 8px; }
          th { background-color: #f4f4f4; text-align: left; }
        </style>
      </head>
      <body>
        ${rfp.proposalHtml}
      </body>
      </html>
    `;

    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "20px", bottom: "20px" },
    });
    await browser.close();

    console.log(`PDF Generated. Size: ${pdfBuffer.length} bytes`);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=proposal-${rfp.id}.pdf`
    );
    res.send(pdfBuffer);
  } catch (error) {
    console.error("PDF Generation Error:", error);
    res.status(500).json({ error: "PDF generation failed" });
  }
});

// 6. Download DOCX
app.post("/api/rfp/:id/download/docx", async (req, res) => {
  try {
    const rfp = rfps.find((r) => r.id === req.params.id);
    if (!rfp || !rfp.proposalHtml) {
      console.error(
        "DOCX Download: RFP not found or no HTML for ID:",
        req.params.id
      );
      return res.status(404).json({ error: "Proposal not found" });
    }

    console.log(
      `Generating DOCX for RFP ${rfp.id}. HTML length: ${rfp.proposalHtml.length}`
    );

    // Wrap in standard HTML structure for DOCX
    const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>${rfp.proposalHtml}</body></html>`;

    // Generate DOCX Buffer (Node.js compatible)
    const docxBuffer = await HTMLtoDOCX(fullHtml, null, {
      table: { row: { cantSplit: true } },
      footer: true,
      pageNumber: true,
    });

    console.log(`DOCX Generated. Size: ${docxBuffer.length} bytes`);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=proposal-${rfp.id}.docx`
    );
    res.send(docxBuffer);
  } catch (error) {
    console.error("DOCX Generation Error:", error);
    res.status(500).json({ error: "DOCX generation failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
