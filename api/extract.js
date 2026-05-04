import { generateWithGemini, parseJsonResponse } from "./_utils/gemini.js";
import { readJsonBody, rejectMethod, sendJson, trimInput } from "./_utils/http.js";

function normalizeNotes(parsed, raw) {
  return {
    title: String(parsed.title || "Study Notes").trim(),
    basics: Array.isArray(parsed.basics) ? parsed.basics.map(String) : [],
    keyConcepts: Array.isArray(parsed.keyConcepts) ? parsed.keyConcepts.map(String) : [],
    importantPoints: Array.isArray(parsed.importantPoints) ? parsed.importantPoints.map(String) : [],
    summary: String(parsed.summary || "").trim(),
    raw
  };
}

export default async function handler(req, res) {
  if (rejectMethod(req, res)) return;

  try {
    const { text } = await readJsonBody(req);
    const content = trimInput(text);

    if (!content) {
      return sendJson(res, 400, { error: "Extracted text is required." });
    }

    // 🔥 DEBUG LOG (important)
    console.log("Input length:", content.length);

    const result = await generateWithGemini(`
Convert this into structured study notes:

Return ONLY valid JSON:
{
  "title": "short topic title",
  "summary": "one concise study summary",
  "basics": ["point"],
  "keyConcepts": ["concept"],
  "importantPoints": ["important point"]
}

Content:
${content.slice(0, 8000)}  // 🔥 prevent overload
`);

    // 🔥 DEBUG OUTPUT
    console.log("Gemini raw output:", result);

    const parsed = parseJsonResponse(result);

    return sendJson(res, 200, {
      notes: normalizeNotes(parsed, result)
    });

  } catch (err) {
    // 🔥 CRITICAL DEBUG
    console.error("API ERROR:", err);

    return sendJson(res, err.statusCode || 500, {
      error: err.message || "Could not generate structured study notes."
    });
  }
}