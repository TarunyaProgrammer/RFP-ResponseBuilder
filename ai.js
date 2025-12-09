const { callGroqChat } = require("./groqClient");

// --- Helper to extract JSON from markdown code blocks if present ---
function parseJson(text) {
  try {
    // Try direct parse
    return JSON.parse(text);
  } catch (e) {
    // Try extracting from ```json ... ```
    const match = text.match(/```json([\s\S]*?)```/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch (e2) {
        console.error("Failed to parse extracted JSON:", match[1]);
      }
    }
    // Try extracting from ``` ... ```
    const match2 = text.match(/```([\s\S]*?)```/);
    if (match2) {
      try {
        return JSON.parse(match2[1]);
      } catch (e3) {
        console.error("Failed to parse extracted code block:", match2[1]);
      }
    }
    return null;
  }
}

async function analyzeRfp(rawText) {
  const systemPrompt = `You are an expert RFP analyzer. 
    Analyze the provided RFP text and extract the following fields in strict JSON format:
    {
        "buyerName": string | null,
        "deadline": string | null,
        "summary": string,
        "keyRequirements": string[],
        "disqualifyingConditions": string[]
    }
    Return ONLY VALID JSON. Do not add conversational text.`;

  const userPrompt = `RFP Text:\n${rawText}`;

  const content = await callGroqChat({ systemPrompt, userPrompt });
  const result = parseJson(content);
  if (!result) {
    throw new Error("Failed to parse AI response for analyzeRfp");
  }
  return result;
}

async function extractLineItems(rawText) {
  const systemPrompt = `You are an expert RFP extraction tool.
    Extract the list of line items (products or services requested) from the RFP text.
    Return a strict JSON array of objects:
    [
        {
            "description": string,
            "quantity": number | null,
            "unit": string | null,
            "notes": string | null
        }
    ]
    Focus on specific SKUs, products, or services. Ignore general legal boilerplate.
    Return ONLY VALID JSON.`;

  const userPrompt = `RFP Text:\n${rawText}`;

  const content = await callGroqChat({ systemPrompt, userPrompt });
  const result = parseJson(content);
  return result || []; // Return empty array on failure
}

async function chooseBestSku(lineItem, candidateSkus) {
  const systemPrompt = `You are a sales engineer matching RFP line items to a product catalog.
    Task: Find the best matching SKU for the requested line item from the provided candidates.
    
    Return strict JSON:
    {
        "chosenSkuCode": string | null, // The skuCode of the best match, or null if none fit well
        "confidence": number, // 0 to 100
        "rationale": string // Brief reason for the match
    }
    Return ONLY VALID JSON.`;

  const userPrompt = `
    Line Item Requested:
    Description: ${lineItem.description}
    Notes: ${lineItem.notes}

    Candidate SKUs:
    ${JSON.stringify(candidateSkus, null, 2)}
    `;

  const content = await callGroqChat({ systemPrompt, userPrompt });
  const result = parseJson(content);
  return (
    result || {
      chosenSkuCode: null,
      confidence: 0,
      rationale: "AI failed to pick",
    }
  );
}

async function generateProposalHtml(rfp, lineItems, marginPercent) {
  const systemPrompt = `You are a professional proposal writer.
    Generate a simple, clean HTML fragment (not a full document, just the inner HTML) for a business proposal.
    Do not use <html>, <head>, or <body> tags. Start with <div> or similar.
    
    Structure:
    1. Header with Title "Proposal for [Buyer Name]"
    2. Executive Summary (based on RFP summary)
    3. Pricing Table (HTML Table with columns: Description, SKU, Qty, Unit, Price, Total)
       - Calculate prices based on the provided line items.
    4. Terms & Conditions (Delivery, Validity)
    5. Closing`;

  // Prepare data for prompt
  const proposalData = {
    buyerName: rfp.buyerName || "Client",
    summary: rfp.summary,
    margin: marginPercent,
    items: lineItems.map((item) => ({
      desc: item.description,
      sku: item.matchedSku ? item.matchedSku.skuCode : "N/A",
      skuName: item.matchedSku ? item.matchedSku.name : "Custom Quote",
      qty: item.quantity || 1,
      unit: item.unit || "each",
      unitPrice: item.matchedSku
        ? (item.matchedSku.baseCost * (1 + marginPercent / 100)).toFixed(2)
        : "TBD",
      total: item.matchedSku
        ? (
            item.matchedSku.baseCost *
            (1 + marginPercent / 100) *
            (item.quantity || 1)
          ).toFixed(2)
        : "TBD",
    })),
  };

  const userPrompt = `Data for proposal:\n${JSON.stringify(
    proposalData,
    null,
    2
  )}`;

  const content = await callGroqChat({ systemPrompt, userPrompt });
  // AI might return markdown code block, strip it if needed, but HTML is usually fine.
  // We already have a parseJson, but this returns HTML string.
  // Just simple cleanup if it puts it in quotes or markdown.
  let html = content.trim();
  if (html.startsWith("```html"))
    html = html.replace(/^```html/, "").replace(/```$/, "");
  else if (html.startsWith("```"))
    html = html.replace(/^```/, "").replace(/```$/, "");

  return html;
}

module.exports = {
  analyzeRfp,
  extractLineItems,
  chooseBestSku,
  generateProposalHtml,
};
