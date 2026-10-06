import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, Square, Trash2, Download, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { annotateCitations } from "@/lib/rag/fusion";
interface SourcePassage { n: number; docName: string; page: number; content: string; sources: ("dense" | "keyword")[]; confidence: number }

export interface ChatSettings {
  docIds: string[] | null;
  topK: number;
  dense: boolean;
  keyword: boolean;
}

interface Retrieval {
  query: string;
  passages: SourcePassage[];
  timings: { rewriteMs: number; retrieveMs: number };
}

function getRetrieval(m: UIMessage): Retrieval | undefined {
  const p = m.parts.find((x) => x.type === "data-retrieval") as { data: Retrieval } | undefined;
  return p?.data;
}
const textOf = (m: UIMessage) => m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");

export function ChatPanel({ settings, disabled }: { settings: ChatSettings; disabled: boolean }) {
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [transport] = useState(
    () => new DefaultChatTransport({ api: "/api/chat", body: () => ({ settings: settingsRef.current }) }),
  );
  const { messages, sendMessage, status, stop, setMessages, error } = useChat({ transport });
  const [input, setInput] = useState("");
  const [latency, setLatency] = useState<Record<string, number>>({});
  const started = useRef<number>(0);
  const bottom = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);
  useEffect(() => {
    if (status === "ready" && messages.length) {
      const last = messages[messages.length - 1]!;
      if (last.role === "assistant" && !latency[last.id]) setLatency((l) => ({ ...l, [last.id]: Date.now() - started.current }));
      ta.current?.focus();
    }
  }, [status, messages, latency]);

  function submit() {
    const q = input.trim();
    if (!q || busy || disabled) return;
    started.current = Date.now();
    sendMessage({ text: q });
    setInput("");
  }

  function exportMd() {
    const md = messages.map((m) => {
      const r = getRetrieval(m);
      let s = `### ${m.role === "user" ? "Question" : "Answer"}\n\n${r ? annotateCitations(textOf(m), r.passages) : textOf(m)}\n`;
      if (r?.passages.length) s += "\n**Sources**\n" + r.passages.map((p) => `- [${p.n}] ${p.docName}, p. ${p.page}`).join("\n") + "\n";
      return s;
    }).join("\n");
    const url = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    Object.assign(document.createElement("a"), { href: url, download: "intellidocs-chat.md" }).click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <h2 className="text-sm font-medium">Ask your documents</h2>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={exportMd} disabled={!messages.length}><Download className="h-4 w-4" /> Export</Button>
          <Button variant="ghost" size="sm" onClick={() => setMessages([])} disabled={!messages.length}><Trash2 className="h-4 w-4" /> Clear</Button>
        </div>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
        {!messages.length && (
          <div className="mx-auto mt-16 max-w-md text-center text-muted-foreground">
            <BookOpen className="mx-auto h-8 w-8 text-primary" />
            <p className="mt-3 text-sm">{disabled ? "Upload a PDF on the left to start asking questions." : "Ask a question. Answers cite the exact document and page."}</p>
          </div>
        )}
        {messages.map((m) => {
          const r = getRetrieval(m);
          const check = (m.parts.find((x) => x.type === "data-check") as { data: { valid: number[]; invalid: number[] } } | undefined)?.data;
          const raw = textOf(m);
          const text = r ? annotateCitations(raw, r.passages) : raw;
          if (m.role === "user")
            return <div key={m.id} className="ml-auto max-w-[80%] rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">{text}</div>;
          return (
            <div key={m.id} className="max-w-[90%] space-y-3">
              <div className="prose prose-sm max-w-none overflow-x-auto text-sm leading-relaxed text-foreground [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_table]:my-3 [&_table]:border-collapse [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:bg-secondary [&_th]:px-2 [&_th]:py-1 [&_th]:text-left">
                {text ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown> : <span className="animate-pulse text-muted-foreground">Searching documents…</span>}
              </div>
              {check && check.invalid.length > 0 && (
                <p className="font-mono text-xs text-warning">Removed {check.invalid.length} citation(s) that didn't match a source.</p>
              )}
              {r && r.passages.length > 0 && (
                <details className="rounded-md border border-border bg-card">
                  <summary className="cursor-pointer px-3 py-2 font-mono text-xs text-muted-foreground">
                    Why this answer · {r.passages.length} passages
                    {latency[m.id] ? ` · ${((latency[m.id] ?? 0) / 1000).toFixed(1)}s` : ""} · retrieval {r.timings.retrieveMs}ms
                  </summary>
                  <div className="space-y-3 border-t border-border p-3">
                    {r.query !== textOf(messages[messages.indexOf(m) - 1] ?? m) && (
                      <p className="font-mono text-xs text-muted-foreground">Search query: “{r.query}”</p>
                    )}
                    {r.passages.map((p) => (
                      <div key={p.n} className="text-xs">
                        <div className="flex items-center gap-2 font-mono">
                          <span className="font-semibold text-primary">[{p.n}]</span>
                          <span className="truncate">{p.docName}</span>
                          <span className="text-muted-foreground">p. {p.page}</span>
                          <span className="rounded bg-secondary px-1.5">{p.sources.length === 2 ? "both" : p.sources[0] === "dense" ? "semantic" : "keyword"}</span>
                          <div className="ml-auto h-1.5 w-20 overflow-hidden rounded bg-muted">
                            <div className="h-full bg-primary" style={{ width: `${Math.round(p.confidence * 100)}%` }} />
                          </div>
                        </div>
                        <p className="mt-1 line-clamp-3 text-muted-foreground">{p.content}</p>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          );
        })}
        {status === "submitted" && messages[messages.length - 1]?.role === "user" && (
          <p className="animate-pulse text-sm text-muted-foreground">Searching documents…</p>
        )}
        {error && <p className="text-sm text-destructive">{error.message || "Something went wrong."}</p>}
        <div ref={bottom} />
      </div>

      <div className="border-t border-border p-4">
        <div className="flex items-end gap-2">
          <Textarea
            ref={ta}
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
            placeholder={disabled ? "Upload a PDF first" : "e.g. How often should the gearbox oil be replaced?"}
            className="min-h-[48px] resize-none bg-card"
            rows={1}
            disabled={disabled}
          />
          {busy ? (
            <Button size="icon" variant="outline" onClick={() => stop()} aria-label="Stop"><Square className="h-4 w-4" /></Button>
          ) : (
            <Button size="icon" onClick={submit} disabled={!input.trim() || disabled} aria-label="Send"><Send className="h-4 w-4" /></Button>
          )}
        </div>
      </div>
    </div>
  );
}
