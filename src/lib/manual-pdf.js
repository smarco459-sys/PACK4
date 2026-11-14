import { createWorker } from "tesseract.js";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

const MAX_PAGES = 120;
const MAX_TEXT_LENGTH = 30000;
const OCR_THRESHOLD = 40;

function normalizeExtractedText(value) {
  return String(value || "")
    .replace(/[\t\u00a0]+/g, " ")
    .replace(/ +\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function notifyProgress(onProgress, details) {
  if (typeof onProgress === "function") onProgress(details);
}

async function recognizeScannedPages(pdfDocument, pages, onProgress) {
  if (!pages.length) return;
  notifyProgress(onProgress, { phase: "ocr-start", totalPages: pages.length });
  const worker = await createWorker("por", 1, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr/core",
    langPath: "/ocr/lang",
    gzip: true,
  });

  try {
    for (let index = 0; index < pages.length; index += 1) {
      const pageInfo = pages[index];
      notifyProgress(onProgress, {
        phase: "ocr",
        pageNumber: pageInfo.pageNumber,
        totalPages: pages.length,
      });
      const page = await pdfDocument.getPage(pageInfo.pageNumber);
      const viewport = page.getViewport({ scale: 1.6 });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Não foi possível preparar a página para OCR.");

      try {
        await page.render({ canvasContext: context, viewport }).promise;
        const result = await worker.recognize(canvas);
        const recognizedText = normalizeExtractedText(result.data.text);
        if (recognizedText.length > pageInfo.text.length) pageInfo.text = recognizedText;
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    }
  } finally {
    await worker.terminate();
  }
}

export async function extractPdfText(file, { onProgress } = {}) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const pdfDocument = await loadingTask.promise;
  const pages = [];

  try {
    const pageLimit = Math.min(pdfDocument.numPages, MAX_PAGES);
    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
      const page = await pdfDocument.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = normalizeExtractedText(content.items.map((item) => `${item.str ?? ""}${item.hasEOL ? "\n" : " "}`).join(""));
      pages.push({ pageNumber, text: pageText });
      notifyProgress(onProgress, { phase: "text", pageNumber, totalPages: pageLimit });
      if (pages.reduce((total, current) => total + current.text.length, 0) >= MAX_TEXT_LENGTH) break;
    }

    const textPages = pages.filter((page) => page.text.length < OCR_THRESHOLD);
    await recognizeScannedPages(pdfDocument, textPages, onProgress);
    return normalizeExtractedText(pages.map((page) => page.text).join("\n\n")).slice(0, MAX_TEXT_LENGTH);
  } finally {
    await loadingTask.destroy();
  }
}
