import Busboy from "busboy";
import pdfParse from "pdf-parse";
import { createWorker } from "tesseract.js";
import { rejectMethod, sendJson } from "./_utils/http.js";

const MAX_FILE_SIZE = 12 * 1024 * 1024;

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({
      headers: req.headers,
      limits: {
        files: 1,
        fileSize: MAX_FILE_SIZE
      }
    });

    let uploadedFile = null;
    let limitHit = false;

    busboy.on("file", (_fieldName, file, info) => {
      const chunks = [];
      const { filename, mimeType } = info;

      file.on("data", (chunk) => chunks.push(chunk));
      file.on("limit", () => {
        limitHit = true;
        file.resume();
      });
      file.on("end", () => {
        uploadedFile = {
          buffer: Buffer.concat(chunks),
          filename,
          mimeType
        };
      });
    });

    busboy.on("error", reject);
    busboy.on("finish", () => {
      if (limitHit) {
        reject(new Error("File is larger than 12MB."));
        return;
      }

      if (!uploadedFile) {
        reject(new Error("No file was uploaded."));
        return;
      }

      resolve(uploadedFile);
    });

    req.pipe(busboy);
  });
}

function isPdf(file) {
  return file.mimeType === "application/pdf" || /\.pdf$/i.test(file.filename || "");
}

function isImage(file) {
  return /^image\//.test(file.mimeType || "") || /\.(png|jpe?g|webp|bmp|tiff?)$/i.test(file.filename || "");
}

async function extractImageText(buffer) {
  const worker = await createWorker("eng");

  try {
    const result = await worker.recognize(buffer);
    return {
      text: result.data.text,
      confidence: Math.round(result.data.confidence || 0)
    };
  } finally {
    await worker.terminate();
  }
}

export default async function handler(req, res) {
  if (rejectMethod(req, res)) {
    return;
  }

  try {
    const file = await parseMultipart(req);
    let extracted = null;
    let metadata = {
      filename: file.filename,
      fileType: file.mimeType
    };

    if (isPdf(file)) {
      const result = await pdfParse(file.buffer);
      extracted = result.text;
      metadata = {
        ...metadata,
        pages: result.numpages
      };
    } else if (isImage(file)) {
      const result = await extractImageText(file.buffer);
      extracted = result.text;
      metadata = {
        ...metadata,
        confidence: result.confidence
      };
    } else {
      sendJson(res, 400, { error: "Upload a PDF or image file." });
      return;
    }

    const text = String(extracted || "").trim();
    if (!text) {
      sendJson(res, 422, {
        error: "No readable text was found in this file.",
        metadata
      });
      return;
    }

    sendJson(res, 200, {
      text,
      metadata
    });
  } catch (error) {
    sendJson(res, 500, {
      error: error.message || "Text extraction failed."
    });
  }
}
