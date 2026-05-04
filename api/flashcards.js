import { generateWithGemini, parseJsonResponse } from "./_utils/gemini.js";
import { readJsonBody, rejectMethod, sendJson, trimInput } from "./_utils/http.js";

const DIFFICULTIES = new Set(["easy", "medium", "hard"]);

function normalizeCard(item, index) {
  const difficulty = String(item.difficulty || "medium").toLowerCase();

  return {
    id: `card-${Date.now()}-${index}`,
    question: String(item.question || "").trim(),
    answer: String(item.answer || "").trim(),
    difficulty: DIFFICULTIES.has(difficulty) ? difficulty : "medium",
    nextReview: Date.now()
  };
}

export default async function handler(req, res) {
  if (rejectMethod(req, res)) {
    return;
  }

  try {
    const { text, incorrectAnswers = [] } = await readJsonBody(req);
    const content = trimInput(text);
    const weakAreas = Array.isArray(incorrectAnswers)
      ? incorrectAnswers
          .slice(0, 12)
          .map((item) => {
            if (typeof item === "string") {
              return item;
            }

            return `${item.question || ""} Correct answer: ${item.correctAnswer || ""} Explanation: ${item.explanation || ""}`;
          })
          .join("\n")
      : "";

    if (!content && !weakAreas) {
      sendJson(res, 400, { error: "Content or incorrect answers are required." });
      return;
    }

    const raw = await generateWithGemini(`
Create smart flashcards for spaced repetition.

Use the source content and especially the weak quiz areas when provided.
Return only valid JSON:
{
  "flashcards": [
    {
      "question": "active recall prompt",
      "answer": "concise answer",
      "difficulty": "easy | medium | hard"
    }
  ]
}

Source content:
${content}

Weak quiz areas:
${weakAreas || "None"}
`);

    const parsed = parseJsonResponse(raw);
    const source = Array.isArray(parsed) ? parsed : parsed.flashcards;
    const flashcards = (source || [])
      .map(normalizeCard)
      .filter((card) => card.question && card.answer)
      .slice(0, 16);

    if (!flashcards.length) {
      sendJson(res, 422, { error: "Gemini did not return usable flashcards." });
      return;
    }

    sendJson(res, 200, { flashcards });
  } catch (error) {
    sendJson(res, error.statusCode || 500, {
      error: error.message || "Could not generate flashcards."
    });
  }
}
