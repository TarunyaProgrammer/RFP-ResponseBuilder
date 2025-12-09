require("dotenv").config();

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

/**
 * Call Groq Chat API
 * @param {Object} params
 * @param {string} params.systemPrompt
 * @param {string} params.userPrompt
 * @param {string} params.model - e.g. "llama3-70b-8192"
 * @returns {Promise<string>}
 */
async function callGroqChat({
  systemPrompt,
  userPrompt,
  model = "llama-3.3-70b-versatile",
}) {
  if (!GROQ_API_KEY) {
    throw new Error("GROQ_API_KEY environment variable not set");
  }

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Groq API error: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error("Error calling Groq API:", error);
    throw error;
  }
}

module.exports = { callGroqChat };
