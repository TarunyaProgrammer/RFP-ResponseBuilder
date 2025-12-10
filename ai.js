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
  const systemPrompt = `You match FMCG RFP line items to internal SKUs.

You will be given:
- ONE RFP line item (description, quantity, unit, notes)
- A SMALL LIST of candidate SKUs from the supplier's catalog

Each candidate SKU has fields like:
- id
- skuCode
- name
- description
- packSize
- category

YOUR JOB:
- Pick the SINGLE best matching SKU, if one clearly fits.
- Or return null if none are a reasonable match.

MATCHING RULES (VERY IMPORTANT):
1. PACK SIZE is the strongest signal.
   - 500ml must match 500ml.
   - 1L must match 1L.
   - If pack size differs, confidence must be <= 40.

2. PRODUCT TYPE must match.
   - Lemon drink ↔ lemon beverage, not orange or cola.
   - Potato chips ↔ chips, not water or beverages.
   - Water ↔ packaged drinking water, not soft drinks.

3. CONTAINER TYPE should be considered.
   - "PET bottle" ↔ PET SKUs, not cans.
   - "can" ↔ can SKUs, not PET bottles.
   - If container type differs, reduce confidence.

4. CATEGORY is a secondary check.
   - Beverages vs Snacks vs Water, etc.

5. If multiple SKUs could match, choose the most specific one
   that matches BOTH pack size AND product type.

OUTPUT FORMAT (STRICT):
- Return ONLY a JSON object, no extra explanation, no markdown.
- Schema:

{
  "chosenSkuCode": "string or null",
  "confidence": number,
  "rationale": "string"
}

Where:
- chosenSkuCode: MUST be one of the candidate skuCode values, or null.
- confidence: integer 0–100.
- rationale: 1–3 short sentences explaining the choice.

IF NO GOOD MATCH:
- If NONE of the candidate SKUs are reasonable (wrong category, wrong pack size, wrong product), then:
  - "chosenSkuCode": null
  - "confidence": 20 or less
  - rationale: explain briefly why nothing fits.

DO NOT:
- Invent new SKU codes.
- Modify SKU codes.
- Use any skuCode that is not in the provided candidate list.`;

  const userPrompt = `
Line item:
${JSON.stringify(lineItem, null, 2)}

Candidate SKUs:
${JSON.stringify(candidateSkus, null, 2)}

Pick the best match following the rules.`;

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
  const systemPrompt = `You are an expert corporate proposal writer and document formatter. 
Generate a beautifully structured, industry-standard proposal in clean HTML that will later be converted to PDF and DOCX.

STRICT RULES:
- DO NOT invent SKU data, quantities, prices, totals, or product descriptions.
- USE EXACT DATA passed in the lineItems input.
- DO NOT include placeholder text such as “Custom Quote” or “Example.”
- DO NOT add commentary or disclaimers.
- DO NOT wrap output in <html> or <body>.
- KEEP THE DESIGN CLEAN, CORPORATE, AND PROFESSIONAL.

FORMATTING REQUIREMENTS:
- Use a single clean, readable font such as system-ui, Arial, or Inter.
- Use consistent spacing (16–24px margins).
- Use bold section headings with spacing above and below.
- Use horizontal dividers (<hr>) between major sections.
- Tables must be clean, bordered, and aligned.
- Price and numeric values must be right-aligned.
- Table headers must be bold and shaded (#f4f4f4).
- Keep everything A4-ready (max width 800px).

STRUCTURE:

1. CENTERED TITLE BLOCK
   - Proposal for [buyerName]
   - Small subtitle with RFP Summary

2. EXECUTIVE SUMMARY
   - 1–2 concise paragraphs summarizing the response
   - Highlight capability, compliance, quality, delivery

3. KEY VALUE POINTS (bullet list)
   - 4–6 strong bullets about quality, compliance, reliability

4. DETAILED LINE ITEM TABLE
   Columns:
   - Description
   - SKU Code
   - SKU Name
   - Quantity
   - Unit
   - Unit Price
   - Total Price

   Requirements:
   - Use <table>, <thead>, <tbody>
   - Use borders: 1px solid #ddd
   - Header background: #f4f4f4
   - Numeric values right-aligned
   - Show “-” if a value is missing

5. TERMS & CONDITIONS
   - Delivery timelines
   - Shelf-life requirements
   - Payment terms
   - Contract validity

6. CLOSING PARAGRAPH
   - Professional, warm closing note
   - Invitation to contact for clarification

OUTPUT:
Return ONLY the HTML fragment for the body content, beautifully formatted and ready for PDF/DOCX generation.

IMPORTANT HTML TEMPLATE:
<div style="font-family: system-ui, Arial; max-width: 800px; margin: 0 auto; padding: 20px;">

  <h1 style="text-align:center; margin-bottom: 4px;">Proposal for {{buyerName}}</h1>
  <p style="text-align:center; font-size:14px; color:#555;">RFP Response – Automated by RFP Velocity</p>

  <hr style="margin: 24px 0;">

  <h2>Executive Summary</h2>
  <p style="line-height:1.6;">[Insert Executive Summary Here]</p>

  <h2>Key Highlights</h2>
  <ul>
    [Insert Key Highlights Here]
  </ul>

  <h2>Commercial Breakdown</h2>

  <table style="width:100%; border-collapse: collapse; margin-top:16px;">
    <thead>
      <tr style="background:#f4f4f4;">
        <th style="border:1px solid #ddd; padding:8px;">Description</th>
        <th style="border:1px solid #ddd; padding:8px;">SKU Code</th>
        <th style="border:1px solid #ddd; padding:8px;">SKU Name</th>
        <th style="border:1px solid #ddd; padding:8px; text-align:right;">Qty</th>
        <th style="border:1px solid #ddd; padding:8px;">Unit</th>
        <th style="border:1px solid #ddd; padding:8px; text-align:right;">Unit Price</th>
        <th style="border:1px solid #ddd; padding:8px; text-align:right;">Total Price</th>
      </tr>
    </thead>
    <tbody>
      {{lineItems}}
    </tbody>
  </table>

  <hr style="margin: 24px 0;">

  <h2>Delivery & Terms</h2>
  <ul>
    [Insert specific delivery and terms]
  </ul>

  <h2>Closing Note</h2>
  <p>[Insert Closing Note]</p>

</div>`;

  // Use enriched items directly (they already have calculated prices)
  const calculatedItems = lineItems;

  const userPrompt = `
Here is the data:

RFP Metadata:
${JSON.stringify(
  {
    buyerName: rfp.buyerName,
    summary: rfp.summary,
    deadline: rfp.deadline,
    requirements: rfp.keyRequirements,
  },
  null,
  2
)}

Line Items:
${JSON.stringify(calculatedItems, null, 2)}

Generate the HTML proposal now.`;

  const content = await callGroqChat({ systemPrompt, userPrompt });

  // Cleanup markdown
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
