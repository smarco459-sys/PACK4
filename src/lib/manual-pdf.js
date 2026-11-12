export async function extractPdfText(file) {
  const { getDocument } = await import("pdfjs-dist");
  const document = await getDocument({ data: await file.arrayBuffer() }).promise;
  let text = "";
  const pageLimit = Math.min(document.numPages, 120);
  for (let pageNumber = 1; pageNumber <= pageLimit && text.length < 30000; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    text += `${content.items.map((item) => item.str ?? "").join(" ")}\n`;
  }
  return text.replace(/\s+/g, " ").trim().slice(0, 30000);
}
