export function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export function rejectMethod(req, res, methods = ["POST"]) {
  if (methods.includes(req.method)) {
    return false;
  }

  res.setHeader("Allow", methods.join(", "));
  sendJson(res, 405, { error: `Method ${req.method} is not allowed.` });
  return true;
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  if (typeof req.body === "string") {
    return JSON.parse(req.body || "{}");
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

export function trimInput(text, maxLength = 18000) {
  const value = String(text || "").replace(/\s+\n/g, "\n").trim();
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}
