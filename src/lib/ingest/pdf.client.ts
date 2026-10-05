/** Browser-only PDF text extraction (per page, line-preserving). */
import type { PageText } from "./chunking";

export async function extractPdfPages(buf: ArrayBuffer): Promise<PageText[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: buf.slice(0) }).promise;
  const pages: PageText[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    let text = "";
    let lastY: number | null = null;
    for (const item of tc.items) {
      if (!("str" in item)) continue;
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 2) text += "\n";
      else if (text && !text.endsWith(" ")) text += " ";
      text += item.str;
      if (item.hasEOL) text += "\n";
      lastY = y;
    }
    pages.push({ page: i, text });
  }
  return pages;
}
