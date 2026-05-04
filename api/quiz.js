import { generateWithGemini, parseJsonResponse } from "./_utils/gemini.js";
import { readJsonBody, rejectMethod, sendJson, trimInput } from "./_utils/http.js";

function normalizeQuestion(item, index) {
  const options = Array.isArray(item.options) ? item.options.slice(0, 4).map(String) : [];
  const correctAnswer = String(item.correctAnswer || item.answer || "").trim();

  return {
    id: `q-${Date.now()}-${index}`,
    question: String(item.question || "").trim(),
    options,
    correctAnswer,
    explanation: String(item.explanation || "").trim()
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
Generate MCQs with answers and explanations from this content.

Create 5 to 10 multiple-choice questions. Return only valid JSON:
{
  "questions": [
    {
      "question": "question text",
      "options": ["option A", "option B", "option C", "option D"],
      "correctAnswer": "exact text of the correct option",
      "explanation": "brief explanation"
    }
  ]
}

Content:
${content}
`);

    const parsed = parseJsonResponse(raw);
    const source = Array.isArray(parsed) ? parsed : parsed.questions;
    const questions = (source || [])
      .map(normalizeQuestion)
      .filter((question) => question.question && question.options.length === 4 && question.correctAnswer);

    if (!questions.length) {
      sendJson(res, 422, { error: "Gemini did not return usable quiz questions." });
      return;
    }

    sendJson(res, 200, { questions });
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      error: error.message || "Could not generate quiz."
    });
  }
}
