import { supabase } from "@/integrations/supabase/client";
import { chunkPages, cleanPageText, findRepeatedLines, LOW_TEXT_THRESHOLD, sha256 } from "./chunking";
import { extractPdfPages } from "./pdf.client";

export type IngestResult =
  | { status: "duplicate"; name: string }
  | { status: "ok"; name: string; pages: number; chunks: number; skippedDuplicateChunks: number; lowTextPages: number[] };

/** Extract → clean → chunk → dedupe → store. */
export async function ingestPdf(file: File): Promise<IngestResult> {
  const buf = await file.arrayBuffer();
  const fileHash = await sha256(buf);
  const { data: existing } = await supabase.from("documents").select("id").eq("file_hash", fileHash).maybeSingle();
  if (existing) return { status: "duplicate", name: file.name };

  const raw = await extractPdfPages(buf);
  const repeated = findRepeatedLines(raw);
  const pages = raw.map((p) => ({ page: p.page, text: cleanPageText(p.text, repeated) }));
  const lowTextPages = pages.filter((p) => p.text.length < LOW_TEXT_THRESHOLD).map((p) => p.page);
  const chunks = chunkPages(pages);

  const hashed = await Promise.all(chunks.map(async (c) => ({ ...c, hash: await sha256(c.content) })));
  const unique = [...new Map(hashed.map((c) => [c.hash, c])).values()];
  const { data: known } = await supabase.from("chunks").select("content_hash").in("content_hash", unique.map((c) => c.hash).slice(0, 500));
  const knownSet = new Set((known ?? []).map((k) => k.content_hash));
  const fresh = unique.filter((c) => !knownSet.has(c.hash));

  const { data: doc, error } = await supabase
    .from("documents")
    .insert({ name: file.name, file_hash: fileHash, page_count: pages.length, low_text_pages: lowTextPages, chunk_count: fresh.length })
    .select("id")
    .single();
  if (error || !doc) throw new Error(error?.message ?? "Could not save document");

  for (let i = 0; i < fresh.length; i += 200) {
    const rows = fresh.slice(i, i + 200).map((c) => ({
      document_id: doc.id, chunk_index: c.chunkIndex, page: c.page,
      char_start: c.charStart, char_end: c.charEnd, content: c.content, content_hash: c.hash,
    }));
    const { error: e } = await supabase.from("chunks").insert(rows);
    if (e) throw new Error(e.message);
  }
  return { status: "ok", name: file.name, pages: pages.length, chunks: fresh.length, skippedDuplicateChunks: chunks.length - fresh.length, lowTextPages };
}
