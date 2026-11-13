import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export async function extractPdfText(file) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const document = await loadingTask.promise;
  let text = "";
  try {
    const pageLimit = Math.min(document.numPages, 120);
    for (let pageNumber = 1; pageNumber <= pageLimit && text.length < 30000; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      text += `${content.items.map((item) => item.str ?? "").join(" ")}\n`;
    }
    return text.replace(/\s+/g, " ").trim().slice(0, 30000);
  } finally {
    await loadingTask.destroy();
  }
}
