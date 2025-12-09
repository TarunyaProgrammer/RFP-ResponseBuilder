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
  const systemPrompt = `You generate a professional but concise SALES PROPOSAL in HTML.

YOU ARE NOT ALLOWED TO INVENT:
- New SKUs
- New prices
- New quantities
- New totals
- Placeholder text like "Custom Quote" or "Example"

You will be given:
- RFP metadata (buyerName, deadline, summary, keyRequirements)
- A list of line items that ALREADY contain:
  - description
  - quantity
  - unit
  - matched SKU information (skuCode, skuName)
  - unitPrice
  - totalPrice

All pricing has ALREADY been calculated by the system.
You must use these numeric values EXACTLY as provided.
Do NOT recalculate or adjust them.
Do NOT say "prices are indicative" or "example".
Do NOT add any notes about how prices were calculated.

OUTPUT FORMAT:
- Return a SINGLE HTML FRAGMENT (string), with:
  - NO <html>, <head>, or <body> tags.
  - Just the inner content.

STRUCTURE OF THE HTML:
1. Title
   - <h2>Proposal for [buyerName]</h2>

2. Short intro / cover letter (2 short paragraphs)
   - Mention the RFP summary briefly.
   - Mention that you can meet the requirements.

3. Key information list
   - A simple <ul> with 3–5 bullet points, e.g.:
     - Contract duration
     - Coverage (pan-India distribution)
     - Quality & compliance (FSSAI, BIS, etc.)

4. Pricing table
   - A single <table> with header row:
     - Description
     - SKU Code
     - SKU Name
     - Quantity
     - Unit
     - Unit Price
     - Total Price
   - For each line item, use EXACT fields from input:
     - description
     - skuCode
     - skuName
     - quantity
     - unit
     - unitPrice
     - totalPrice
   - DO NOT change currencies or numbers.
   - DO NOT introduce "Custom Quote".
   - If a line item has null price, show "-" for that cell.

5. Delivery & Terms section
   - A <h3>Delivery & Terms</h3>
   - 3–5 bullet points (<ul><li>...</li></ul>) about:
     - Delivery timelines (e.g., within X days of PO)
     - Minimum shelf life compliance
     - Price validity
     - Payment terms (generic)

6. Closing paragraph
   - 1 short <p> thanking the buyer and inviting further discussion.

STYLE:
- Use simple, clean HTML only.
- No inline CSS, no scripts.
- Do NOT include explanations like "Note: these prices are examples" or "calculated with margin".
- The output should be ready to drop into a web page as-is.

AGAIN:
- Use ONLY the data given in the input.
- Do NOT invent any values, SKUs, or prices.`;

  // Use enriched items directly (they already have calculated prices)
  const calculatedItems = lineItems;

  const userPrompt = `
Here is the structured data you must use to generate the proposal.

RFP metadata:
${JSON.stringify(
  {
    buyerName: rfp.buyerName,
    deadline: rfp.deadline,
    summary: rfp.summary,
    keyRequirements: rfp.keyRequirements,
  },
  null,
  2
)}

Line items (each object already includes all pricing & SKU info):
${JSON.stringify(calculatedItems, null, 2)}

Generate the HTML fragment according to the instructions.`;

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
