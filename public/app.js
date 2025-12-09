// State
let currentRfpId = null;
let currentLineItems = [];

// Elements
const dom = {
  btnUploadSku: document.getElementById("btnUploadSku"),
  skuCsvInput: document.getElementById("skuCsvInput"),
  uploadStatus: document.getElementById("uploadStatus"),
  btnAnalyze: document.getElementById("btnAnalyze"),
  rfpTextInput: document.getElementById("rfpTextInput"),
  analysisResult: document.getElementById("analysisResult"),
  sectionMatching: document.getElementById("sectionMatching"), // Fixed ID reference
  sectionGenerate: document.getElementById("section-generate"),
  lineItemsList: document.getElementById("lineItemsList"),
  btnMatch: document.getElementById("btnMatch"),
  btnGenerate: document.getElementById("btnGenerate"),
  proposalPreview: document.getElementById("proposalPreview"),
  inputMargin: document.getElementById("inputMargin"),
  btnDownload: document.getElementById("btnDownload"),
  downloadActions: document.getElementById("downloadActions"),
};

// --- HANDLERS ---

// 1. Upload
dom.btnUploadSku.addEventListener("click", async () => {
  const file = dom.skuCsvInput.files[0];
  if (!file) {
    alert("Please select a CSV file first.");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  dom.uploadStatus.textContent = "Uploading...";

  try {
    const res = await fetch("/api/skus/upload-csv", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    dom.uploadStatus.textContent = data.message || "Upload success";
  } catch (e) {
    console.error(e);
    dom.uploadStatus.textContent = "Upload failed.";
  }
});

// 2. Analyze
dom.btnAnalyze.addEventListener("click", async () => {
  const text = dom.rfpTextInput.value;
  if (!text.trim()) {
    alert("Please enter RFP text.");
    return;
  }

  dom.btnAnalyze.textContent = "Analyzing... (this may take a moment)";
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
    document.getElementById("section-matching").classList.remove("hidden");
  } catch (e) {
    console.error(e);
    alert("Analysis failed: " + e.message);
  } finally {
    dom.btnAnalyze.textContent = "Analyze RFP";
    dom.btnAnalyze.disabled = false;
  }
});

// 3. Match
dom.btnMatch.addEventListener("click", async () => {
  if (!currentRfpId) return;

  dom.btnMatch.textContent = "Matching SKUs... (AI at work)";
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
    dom.proposalPreview.classList.remove("hidden");
    dom.downloadActions.classList.remove("hidden");
  } catch (e) {
    console.error(e);
    alert("Generation failed");
  } finally {
    dom.btnGenerate.textContent = "Generate HTML";
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

// Helper: Render items
function renderLineItems(items) {
  dom.lineItemsList.innerHTML = "";
  items.forEach((item) => {
    const el = document.createElement("div");
    el.className = "line-item-card";

    let matchHtml = "";
    if (item.matchedSku) {
      matchHtml = `
                <div class="matched-sku-info">
                    <strong>Matced SKU:</strong> ${item.matchedSku.skuCode} - ${item.matchedSku.name}<br>
                    <small>Cost: $${item.matchedSku.baseCost} | Conf: ${item.matchConfidence}%</small>
                </div>
            `;
    }

    el.innerHTML = `
            <div class="line-item-header">
                <strong>${item.description}</strong>
                <span class="match-status ${item.matchedSku ? "matched" : ""}">
                    ${item.matchedSku ? "MATCHED" : "PENDING"}
                </span>
            </div>
            <div style="font-size: 0.9rem; color: #ccc;">
                Qty: ${item.quantity || "-"} | Unit: ${item.unit || "-"}
            </div>
            ${matchHtml}
        `;
    dom.lineItemsList.appendChild(el);
  });
}
