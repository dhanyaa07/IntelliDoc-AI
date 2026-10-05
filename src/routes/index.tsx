import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { FileText, Trash2, Upload, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { ingestPdf } from "@/lib/ingest/ingest.client";
import { embedPendingChunks } from "@/lib/rag/embed.functions";
import { ChatPanel } from "@/components/ChatPanel";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "IntelliDocs AI — Ask your technical PDFs" },
      { name: "description", content: "Upload technical PDFs and get grounded answers with page-level citations." },
      { property: "og:title", content: "IntelliDocs AI — Ask your technical PDFs" },
      { property: "og:description", content: "Upload technical PDFs and get grounded answers with page-level citations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const qc = useQueryClient();
  const docs = useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      const { data, error } = await supabase.from("documents").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [topK, setTopK] = useState(6);
  const [dense, setDense] = useState(true);
  const [keyword, setKeyword] = useState(true);

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    for (const f of Array.from(files)) {
      setBusy(`Reading ${f.name}…`);
      try {
        const r = await ingestPdf(f);
        setLog((l) => [r.status === "duplicate" ? `• ${r.name}: already indexed` : `✓ ${r.name}: ${r.pages} pages → ${r.chunks} chunks${r.lowTextPages.length ? ` · ${r.lowTextPages.length} low-text pages` : ""}`, ...l]);
      } catch (e) {
        setLog((l) => [`✗ ${f.name}: ${e instanceof Error ? e.message : "Could not read this PDF"}`, ...l]);
      }
    }
    setBusy("Building search index…");
    try {
      const r = await embedPendingChunks();
      if (r.embedded) setLog((l) => [`✓ search index updated (${r.embedded} chunks)`, ...l]);
    } catch (e) {
      setLog((l) => [`✗ search index: ${e instanceof Error ? e.message : "failed"}`, ...l]);
    }
    setBusy(null);
    if (input.current) input.current.value = "";
    qc.invalidateQueries({ queryKey: ["documents"] });
  }

  async function remove(id: string) {
    await supabase.from("documents").delete().eq("id", id);
    setSelected((s) => s.filter((x) => x !== id));
    qc.invalidateQueries({ queryKey: ["documents"] });
  }

  const totalChunks = docs.data?.reduce((s, d) => s + d.chunk_count, 0) ?? 0;
  const hasDocs = (docs.data?.length ?? 0) > 0;

  return (
    <div className="flex h-screen flex-col font-sans">
      <header className="flex items-baseline justify-between border-b border-border px-6 py-4">
        <h1 className="text-xl font-semibold tracking-tight">IntelliDocs<span className="text-primary"> AI</span></h1>
        <p className="font-mono text-xs text-muted-foreground">{docs.data?.length ?? 0} docs · {totalChunks} chunks</p>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="w-full shrink-0 space-y-6 overflow-y-auto border-b border-border bg-sidebar p-5 md:w-80 md:border-b-0 md:border-r">
          <section
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
            className="rounded-lg border-2 border-dashed border-border bg-card p-5 text-center"
          >
            <Upload className="mx-auto h-6 w-6 text-primary" />
            <input ref={input} type="file" accept="application/pdf" multiple hidden onChange={(e) => handleFiles(e.target.files)} />
            <Button size="sm" className="mt-3" disabled={!!busy} onClick={() => input.current?.click()}>
              {busy ?? "Upload PDFs"}
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">or drop files here</p>
          </section>

          {log.length > 0 && (
            <div className="space-y-1 font-mono text-[11px] text-muted-foreground">
              {log.slice(0, 5).map((l, i) => <div key={i} className={l.startsWith("✗") ? "text-destructive" : ""}>{l}</div>)}
            </div>
          )}

          <section>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Documents {selected.length ? `· ${selected.length} in scope` : "· all in scope"}
            </h3>
            {!hasDocs && <p className="text-sm text-muted-foreground">No documents yet.</p>}
            <ul className="space-y-1">
              {docs.data?.map((d) => (
                <li key={d.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-sidebar-accent">
                  <Checkbox
                    checked={selected.includes(d.id)}
                    onCheckedChange={(c) => setSelected((s) => (c ? [...s, d.id] : s.filter((x) => x !== d.id)))}
                    aria-label={`Limit to ${d.name}`}
                  />
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{d.name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{d.page_count}p · {d.chunk_count} chunks</p>
                  </div>
                  {d.low_text_pages.length > 0 && (
                    <AlertTriangle className="h-4 w-4 text-warning" aria-label={`${d.low_text_pages.length} pages with little text`} />
                  )}
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(d.id)} aria-label={`Remove ${d.name}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-4">
            <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Retrieval</h3>
            <div>
              <div className="mb-2 flex justify-between text-sm"><span>Passages (top-k)</span><span className="font-mono">{topK}</span></div>
              <Slider min={1} max={15} step={1} value={[topK]} onValueChange={([v]) => setTopK(v)} />
            </div>
            <label className="flex items-center justify-between text-sm">Semantic search <Switch checked={dense} onCheckedChange={(v) => (v || keyword) && setDense(v)} /></label>
            <label className="flex items-center justify-between text-sm">Keyword search <Switch checked={keyword} onCheckedChange={(v) => (v || dense) && setKeyword(v)} /></label>
          </section>
        </aside>

        <main className="min-h-0 flex-1">
          <ChatPanel settings={{ docIds: selected.length ? selected : null, topK, dense, keyword }} disabled={!hasDocs} />
        </main>
      </div>
    </div>
  );
}
