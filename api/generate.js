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
  if (rejectMethod(req, res)) {
    return;
  }

  try {
    const { text } = await readJsonBody(req);
    const content = trimInput(text);

    if (!content) {
      sendJson(res, 400, { error: "Text content is required." });
      return;
    }

    const raw = await generateWithGemini(`
Convert this into structured study notes:
- Basics
- Key Concepts
- Important Points

Return only valid JSON with this shape:
{
  "title": "short topic title",
  "summary": "one concise study summary",
  "basics": ["plain-language foundation point"],
  "keyConcepts": ["core concept with definition"],
  "importantPoints": ["exam-worthy point or caveat"]
}

Content:
${content}
`);

    const parsed = parseJsonResponse(raw);
    sendJson(res, 200, { notes: normalizeNotes(parsed, raw) });
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      error: error.message || "Could not generate study notes."
    });
  }
}
