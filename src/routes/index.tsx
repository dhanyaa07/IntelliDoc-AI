import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { FileText, Trash2, Upload, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ingestPdf, type IngestResult } from "@/lib/ingest/ingest.client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "IntelliDocs AI — Document library" },
      { name: "description", content: "Upload technical PDFs and index them page by page for cited answers." },
      { property: "og:title", content: "IntelliDocs AI — Document library" },
      { property: "og:description", content: "Upload technical PDFs and index them page by page for cited answers." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function useDocuments() {
  return useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("documents").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function Index() {
  const qc = useQueryClient();
  const docs = useDocuments();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<(IngestResult | { status: "error"; name: string; message: string })[]>([]);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const f of Array.from(files)) {
      setBusy(f.name);
      try {
        const r = await ingestPdf(f);
        setLog((l) => [r, ...l]);
      } catch (e) {
        setLog((l) => [{ status: "error", name: f.name, message: e instanceof Error ? e.message : "Could not read this PDF" }, ...l]);
      }
    }
    setBusy(null);
    qc.invalidateQueries({ queryKey: ["documents"] });
  }

  async function remove(id: string) {
    await supabase.from("documents").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["documents"] });
  }

  const totalChunks = docs.data?.reduce((s, d) => s + d.chunk_count, 0) ?? 0;

  return (
    <div className="min-h-screen font-sans">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-baseline justify-between px-6 py-5">
          <h1 className="text-xl font-semibold tracking-tight">IntelliDocs<span className="text-primary"> AI</span></h1>
          <p className="font-mono text-xs text-muted-foreground">
            {docs.data?.length ?? 0} docs · {totalChunks} chunks indexed
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-8 px-6 py-10">
        <section
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
          className="rounded-lg border-2 border-dashed border-border bg-card p-10 text-center"
        >
          <Upload className="mx-auto h-8 w-8 text-primary" />
          <h2 className="mt-3 text-lg font-medium">Add PDFs to the library</h2>
          <p className="mt-1 text-sm text-muted-foreground">Text is extracted per page, cleaned, and split into 800-char chunks with 150 overlap.</p>
          <input ref={input} type="file" accept="application/pdf" multiple hidden onChange={(e) => handleFiles(e.target.files)} />
          <Button className="mt-5" disabled={!!busy} onClick={() => input.current?.click()}>
            {busy ? `Indexing ${busy}…` : "Choose PDFs"}
          </Button>
        </section>

        {log.length > 0 && (
          <section className="space-y-1 font-mono text-xs">
            {log.map((r, i) => (
              <div key={i} className={r.status === "error" ? "text-destructive" : "text-muted-foreground"}>
                {r.status === "ok" && `✓ ${r.name}: ${r.pages} pages → ${r.chunks} chunks${r.skippedDuplicateChunks ? ` (${r.skippedDuplicateChunks} duplicates skipped)` : ""}${r.lowTextPages.length ? ` · low-text pages: ${r.lowTextPages.join(", ")}` : ""}`}
                {r.status === "duplicate" && `• ${r.name}: already indexed, skipped`}
                {r.status === "error" && `✗ ${r.name}: ${r.message}`}
              </div>
            ))}
          </section>
        )}

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">Library</h2>
          {docs.data?.length === 0 && <p className="text-sm text-muted-foreground">No documents yet.</p>}
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {docs.data?.map((d) => (
              <li key={d.id} className="flex items-center gap-4 px-4 py-3">
                <FileText className="h-5 w-5 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{d.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {d.page_count} pages · {d.chunk_count} chunks
                  </p>
                </div>
                {d.low_text_pages.length > 0 && (
                  <span className="flex items-center gap-1 text-xs text-warning" title="Pages with little or no text — possibly scanned">
                    <AlertTriangle className="h-4 w-4" /> {d.low_text_pages.length} low-text
                  </span>
                )}
                <Button variant="ghost" size="icon" onClick={() => remove(d.id)} aria-label={`Remove ${d.name}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
