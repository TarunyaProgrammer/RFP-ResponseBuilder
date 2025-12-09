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

const app = express();
const upload = multer({ dest: "uploads/" });

app.use(express.static("public"));
app.use(express.json());

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

// 3. Match SKUs for an RFP
app.post("/api/rfp/:id/match", async (req, res) => {
  try {
    const rfpId = req.params.id;
    const rfp = rfps.find((r) => r.id === rfpId);
    if (!rfp) return res.status(404).json({ error: "RFP not found" });

    // For each line item, find best SKU
    // In a real app, we'd use vector search. Here, we'll brute force or just pass top 10 SKUs?
    // Passing all SKUs to context might be too big.
    // Hackathon optimize: Just pass first 20 SKUs or filter by simple name match first.
    // Let's optimize: Filter SKUs that share words?
    // SIMPLIFICATION: Pass top 5 SKUs that have any word overlap in name/desc.
    // If no match, pass a random subset to check validatiy?
    // Actually, let's just send the first 10-15 SKUs to keep it simple and cheap for now,
    // OR better: do a crude keyword search.

    const tasks = rfp.lineItems.map(async (item) => {
      // Crude keyword filter
      const keywords = (item.description || "").toLowerCase().split(" ");
      let candidates = skus
        .filter((s) => {
          const text = (s.name + " " + s.description).toLowerCase();
          return keywords.some((k) => k.length > 3 && text.includes(k));
        })
        .slice(0, 5);

      if (candidates.length === 0) {
        // Fallback: just take first 5
        candidates = skus.slice(0, 5);
      }

      const matchResult = await chooseBestSku(item, candidates);

      if (matchResult.chosenSkuCode) {
        const sku = skus.find((s) => s.skuCode === matchResult.chosenSkuCode);
        if (sku) {
          item.matchedSkuId = sku.id;
          item.matchedSku = sku; // Store ref for easy access
          item.matchConfidence = matchResult.confidence;
          item.rationale = matchResult.rationale;
        }
      }
      return item;
    });

    await Promise.all(tasks);
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

    const html = await generateProposalHtml(rfp, rfp.lineItems, marginPercent);
    rfp.proposalHtml = html;

    res.json({ html });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Generation failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
