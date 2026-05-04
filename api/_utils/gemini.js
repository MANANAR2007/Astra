import { GoogleGenerativeAI } from "@google/generative-ai";

let genAI;

function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    const error = new Error("Missing GEMINI_API_KEY environment variable.");
    error.statusCode = 500;
    throw error;
  }

  if (!genAI) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }

  return genAI;
}

export async function generateWithGemini(prompt) {
  try {
    const client = getClient();

    const model = client.getGenerativeModel({
      model: "gemini-1.5-flash"
    });

    const result = await model.generateContent(prompt);
    const response = await result.response;

    const text = response.text();

    if (!text) {
      throw new Error("Empty response from Gemini");
    }

    return text;
  } catch (err) {
    console.error("Gemini Error:", err);
    throw new Error(err.message || "Gemini API failed");
  }
}

export function parseJsonResponse(text) {
  const cleaned = String(text || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const objectStart = cleaned.indexOf("{");
    const arrayStart = cleaned.indexOf("[");
    const starts = [objectStart, arrayStart].filter((i) => i >= 0);

    if (!starts.length) {
      throw new Error("Gemini did not return valid JSON.");
    }

    const start = Math.min(...starts);
    const openChar = cleaned[start];
    const closeChar = openChar === "{" ? "}" : "]";
    const end = cleaned.lastIndexOf(closeChar);

    if (end <= start) {
      throw new Error("Incomplete JSON from Gemini.");
    }

    return JSON.parse(cleaned.slice(start, end + 1));
  }
}