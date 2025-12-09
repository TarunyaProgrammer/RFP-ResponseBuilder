// State
let currentRfpId = null;
let currentLineItems = [];

// Elements
// Elements
const dom = {
  btnUploadSku: document.getElementById("btnUploadSku"),
  skuCsvInput: document.getElementById("skuCsvInput"),
  uploadStatus: document.getElementById("uploadStatus"),
  btnAnalyze: document.getElementById("btnAnalyze"),
  rfpTextInput: document.getElementById("rfpTextInput"),
  analysisResult: document.getElementById("analysisResult"),
  sectionMatching: document.getElementById("section-matching"),
  sectionGenerate: document.getElementById("section-generate"),
  lineItemsList: document.getElementById("lineItemsList"), // Tbody or wrapper
  btnMatch: document.getElementById("btnMatch"),
  btnGenerate: document.getElementById("btnGenerate"),
  proposalPreview: document.getElementById("proposalPreview"),
  proposalContainer: document.getElementById("proposalContainer"),
  inputMargin: document.getElementById("inputMargin"),
  btnDownload: document.getElementById("btnDownload"),
};

// ... (Handlers 1, 2, 3 remain mostly same, just checking visibility toggles)

// 2. Analyze
dom.btnAnalyze.addEventListener("click", async () => {
  const text = dom.rfpTextInput.value;
  if (!text.trim()) {
    alert("Please enter RFP text.");
    return;
  }

  dom.btnAnalyze.textContent = "Analyzing...";
  dom.btnAnalyze.disabled = true;

  try {
    const res = await fetch("/api/rfp/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rfpText: text }),
    });
    const data = await res.json();

    if (data.error) throw new Error(data.error);

    currentRfpId = data.id;
    currentLineItems = data.lineItems;

    // Show Analysis
    document.getElementById("dispBuyer").textContent = data.buyerName || "N/A";
    document.getElementById("dispDeadline").textContent =
      data.deadline || "N/A";
    document.getElementById("dispSummary").textContent =
      data.summary || "No summary available.";
    dom.analysisResult.classList.remove("hidden");

    // Show Matching Section
    renderLineItems(currentLineItems);
    dom.sectionMatching.classList.remove("hidden");
  } catch (e) {
    console.error(e);
    alert("Analysis failed: " + e.message);
  } finally {
    dom.btnAnalyze.textContent = "Analyze Text";
    dom.btnAnalyze.disabled = false;
  }
});

// 3. Match
dom.btnMatch.addEventListener("click", async () => {
  if (!currentRfpId) return;

  dom.btnMatch.textContent = "Matching...";
  dom.btnMatch.disabled = true;

  try {
    const res = await fetch(`/api/rfp/${currentRfpId}/match`, {
      method: "POST",
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);

    // Update items
    currentLineItems = data.lineItems;
    renderLineItems(currentLineItems);

    // Show Generate Section
    dom.sectionGenerate.classList.remove("hidden");
  } catch (e) {
    console.error(e);
    alert("Matching failed");
  } finally {
    dom.btnMatch.textContent = "Run AI Matching";
    dom.btnMatch.disabled = false;
  }
});

// 4. Generate
dom.btnGenerate.addEventListener("click", async () => {
  if (!currentRfpId) return;

  const margin = dom.inputMargin.value;
  dom.btnGenerate.textContent = "Generating...";
  dom.btnGenerate.disabled = true;

  try {
    const res = await fetch(`/api/rfp/${currentRfpId}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ marginPercent: parseFloat(margin) }),
    });
    const data = await res.json();

    dom.proposalPreview.innerHTML = data.html;
    dom.proposalContainer.classList.remove("hidden"); // Show container
  } catch (e) {
    console.error(e);
    alert("Generation failed");
  } finally {
    dom.btnGenerate.textContent = "Generate Proposal";
    dom.btnGenerate.disabled = false;
  }
});

// 5. Download
dom.btnDownload.addEventListener("click", () => {
  const htmlContent = dom.proposalPreview.innerHTML;
  const fullHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Proposal</title>
        <style>
            body { font-family: sans-serif; max-width: 800px; margin: 2rem auto; line-height: 1.6; }
            table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f4f4f4; }
        </style>
    </head>
    <body>
        ${htmlContent}
    </body>
    </html>
    `;

  const blob = new Blob([fullHtml], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `proposal-${currentRfpId}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});

// Helper: Render items (Table Layout)
function renderLineItems(items) {
  dom.lineItemsList.innerHTML = "";
  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "line-item-row";

    let matchHtml = '<span class="pending-match">Pending match...</span>';
    if (item.matchedSku) {
      matchHtml = `
                <div class="match-box">
                    <div class="match-title">${item.matchedSku.skuCode}</div>
                    <div class="match-meta">
                        <span>$${item.matchedSku.baseCost}</span>
                        <span>${item.matchConfidence}% Match</span>
                    </div>
                </div>
            `;
    }

    row.innerHTML = `
            <div>${item.description}</div>
            <div style="color: var(--text-secondary);">${
              item.quantity || "-"
            }</div>
            <div style="color: var(--text-secondary);">${item.unit || "-"}</div>
            <div>${matchHtml}</div>
        `;
    dom.lineItemsList.appendChild(row);
  });
}
