/** Pure ingestion helpers: cleaning, chunking, hashing. No browser/server deps. */

export interface PageText {
  page: number; // 1-based
  text: string;
}

export interface Chunk {
  chunkIndex: number;
  page: number;
  charStart: number; // offset within the page text
  charEnd: number;
  content: string;
}

export const CHUNK_SIZE = 800;
export const CHUNK_OVERLAP = 150;
export const LOW_TEXT_THRESHOLD = 40; // chars; below this a page is flagged (likely scanned)

/** Lines that repeat on >=50% of pages (min 3 pages) are treated as headers/footers. */
export function findRepeatedLines(pages: PageText[]): Set<string> {
  const counts = new Map<string, number>();
  for (const p of pages) {
    const lines = p.text.split("\n").map((l) => normalizeLine(l)).filter(Boolean);
    const edge = new Set([...lines.slice(0, 2), ...lines.slice(-2)]);
    for (const l of edge) counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  const min = Math.max(3, Math.ceil(pages.length * 0.5));
  return new Set([...counts].filter(([, c]) => c >= min).map(([l]) => l));
}

function normalizeLine(l: string): string {
  return l.trim().replace(/\d+/g, "#");
}

/** Remove headers/footers, bare page numbers, and join hyphenated line breaks. */
export function cleanPageText(text: string, repeated: Set<string> = new Set()): string {
  const all = text.split("\n");
  const n = all.length;
  // Only strip repeated lines at the top/bottom edges, never body text.
  const lines = all
    .filter((l, i) => !((i < 2 || i >= n - 2) && repeated.has(normalizeLine(l))))
    .filter((l) => !/^\s*(page\s*)?\d{1,4}(\s*(of|\/)\s*\d{1,4})?\s*$/i.test(l));
  return lines
    .join("\n")
    .replace(/(\w)-\n(\w)/g, "$1$2")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const SEPARATORS = ["\n\n", "\n", ". ", " ", ""];

/** Recursive character splitter (same algorithm as RecursiveCharacterTextSplitter). */
export function splitText(text: string, size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  return recurse(text, SEPARATORS, size, overlap);
}

function recurse(text: string, seps: string[], size: number, overlap: number): string[] {
  if (text.length <= size) return text.trim() ? [text] : [];
  const sepIdx = seps.findIndex((s) => s === "" || text.includes(s));
  const sep = seps[sepIdx];
  const rest = seps.slice(sepIdx + 1);
  const parts = sep === "" ? text.split("") : text.split(sep);
  const pieces: string[] = [];
  for (const p of parts) {
    if (p.length > size && rest.length) pieces.push(...recurse(p, rest, size, overlap));
    else pieces.push(p);
  }
  return merge(pieces, sep, size, overlap);
}

function merge(pieces: string[], sep: string, size: number, overlap: number): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  let len = 0;
  for (const p of pieces) {
    const add = p.length + (cur.length ? sep.length : 0);
    if (len + add > size && cur.length) {
      out.push(cur.join(sep));
      while (cur.length && (len > overlap || len + p.length + sep.length > size)) {
        len -= cur[0].length + (cur.length > 1 ? sep.length : 0);
        cur.shift();
      }
    }
    cur.push(p);
    len += p.length + (cur.length > 1 ? sep.length : 0);
  }
  if (cur.length) out.push(cur.join(sep));
  return out.map((s) => s.trim()).filter(Boolean);
}

/** Chunk each page separately so every chunk maps to exactly one page. */
export function chunkPages(pages: PageText[], size = CHUNK_SIZE, overlap = CHUNK_OVERLAP): Chunk[] {
  const chunks: Chunk[] = [];
  for (const p of pages) {
    let cursor = 0;
    for (const content of splitText(p.text, size, overlap)) {
      const found = p.text.indexOf(content, Math.max(0, cursor - overlap - 1));
      const start = found >= 0 ? found : cursor;
      chunks.push({ chunkIndex: chunks.length, page: p.page, charStart: start, charEnd: start + content.length, content });
      cursor = start + content.length;
    }
  }
  return chunks;
}

export async function sha256(input: string | ArrayBuffer): Promise<string> {
  const data = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
