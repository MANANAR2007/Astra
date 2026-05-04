import { GoogleGenAI } from "@google/genai";

let ai;

function getClient() {
  if (!process.env.GEMINI_API_KEY) {
    const error = new Error("Missing GEMINI_API_KEY environment variable.");
    error.statusCode = 500;
    throw error;
  }

  if (!ai) {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY
    });
  }

  return ai;
}

export async function generateWithGemini(contents) {
  const client = getClient();

  const response = await client.models.generateContent({
    model: "gemini-2.5-flash",
    contents
  });

  return response.text;
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
      throw new Error("Gemini did not return complete JSON.");
    }

    return JSON.parse(cleaned.slice(start, end + 1));
  }
}