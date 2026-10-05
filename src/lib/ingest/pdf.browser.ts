/** Browser-only PDF text extraction (per page, line-preserving). */
import type { PageText } from "./chunking";

export interface ExtractedPage extends PageText {
  /** True when the page draws images (tables/figures may be pictures, not text). */
  hasImages: boolean;
}

export async function extractPdfPages(buf: ArrayBuffer): Promise<ExtractedPage[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: buf.slice(0) }).promise;
  const imageOps = new Set([pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageMaskXObject]);
  const pages: ExtractedPage[] = [];
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
    const ops = await page.getOperatorList();
    const hasImages = ops.fnArray.some((f) => imageOps.has(f));
    pages.push({ page: i, text, hasImages });
  }
  return pages;
}

/** Render one page to a JPEG data URL for image reading. */
export async function renderPageImage(buf: ArrayBuffer, pageNum: number, scale = 1.6): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const doc = await pdfjs.getDocument({ data: buf.slice(0) }).promise;
  const page = await doc.getPage(pageNum);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext("2d")!;
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return canvas.toDataURL("image/jpeg", 0.85);
}
