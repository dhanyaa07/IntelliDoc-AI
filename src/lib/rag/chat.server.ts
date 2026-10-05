import { createUIMessageStream, createUIMessageStreamResponse, streamText, convertToModelMessages, type UIMessage } from "ai";
import { z } from "zod";
import { rrfFuse, NOT_FOUND, type Hit } from "./fusion";
import { CHAT_MODEL, embed, GatewayError, LOW_REASONING, responsesProvider } from "./gateway.server";

const Body = z.object({
  messages: z.array(z.any()),
  settings: z.object({
    docIds: z.array(z.string().uuid()).nullable(),
    topK: z.number().int().min(1).max(15),
    dense: z.boolean(),
    keyword: z.boolean(),
  }),
});

export interface SourcePassage {
  n: number;
  docName: string;
  page: number;
  content: string;
  sources: ("dense" | "keyword")[];
  confidence: number; // 0..1, normalized fusion score
}

function textOf(m: UIMessage): string {
  return m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
}

/** Rewrite a follow-up into a standalone search query using recent history. */
async function rewriteQuery(messages: UIMessage[], signal: AbortSignal): Promise<string> {
  const last = textOf(messages[messages.length - 1]);
  const history = messages.slice(-7, -1);
  if (!history.length) return last;
  const convo = history.map((m) => `${m.role}: ${textOf(m).slice(0, 600)}`).join("\n");
  const r = streamText({
    model: responsesProvider().responses(CHAT_MODEL),
    system: "Rewrite the user's latest question into one standalone search query using the conversation. Output only the query.",
    prompt: `Conversation:\n${convo}\n\nLatest question: ${last}`,
    abortSignal: signal,
    providerOptions: LOW_REASONING,
  });
  return ((await r.text).trim() || last).slice(0, 500);
}

export async function handleChat(request: Request): Promise<Response> {
  const parsed = Body.safeParse(await request.json());
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const { messages, settings } = parsed.data as { messages: UIMessage[]; settings: z.infer<typeof Body>["settings"] };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const t0 = Date.now();

  try {
    const query = await rewriteQuery(messages, request.signal);
    const tRewrite = Date.now();
    const pool = 20;
    const docIds = settings.docIds?.length ? settings.docIds : null;

    const [dense, keyword] = await Promise.all([
      settings.dense
        ? embed([query]).then(async ([v]) => {
            const { data, error } = await supabaseAdmin.rpc("match_chunks_dense", { query_embedding: JSON.stringify(v), doc_ids: docIds as string[], match_count: pool });
            if (error) throw new Error(error.message);
            return (data ?? []) as Hit[];
          })
        : Promise.resolve([] as Hit[]),
      settings.keyword
        ? supabaseAdmin.rpc("match_chunks_text", { query_text: query, doc_ids: docIds as string[], match_count: pool }).then(({ data, error }) => {
            if (error) throw new Error(error.message);
            return (data ?? []) as Hit[];
          })
        : Promise.resolve([] as Hit[]),
    ]);
    const tRetrieve = Date.now();

    const fused = rrfFuse(dense, keyword).slice(0, settings.topK);
    const maxRrf = 2 / 61; // top rank in both lists
    const { data: docs } = await supabaseAdmin.from("documents").select("id, name").in("id", [...new Set(fused.map((f) => f.document_id))]);
    const names = new Map((docs ?? []).map((d) => [d.id, d.name]));
    const passages: SourcePassage[] = fused.map((f, i) => ({
      n: i + 1, docName: names.get(f.document_id) ?? "document", page: f.page, content: f.content,
      sources: f.sources, confidence: Math.min(1, f.rrf / maxRrf),
    }));

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        writer.write({ type: "data-retrieval", data: { query, passages, timings: { rewriteMs: tRewrite - t0, retrieveMs: tRetrieve - tRewrite } } });
        if (!passages.length) {
          const id = "nf";
          writer.write({ type: "text-start", id });
          writer.write({ type: "text-delta", id, delta: NOT_FOUND });
          writer.write({ type: "text-end", id });
          return;
        }
        const context = passages.map((p) => `[${p.n}] (${p.docName}, page ${p.page})\n${p.content}`).join("\n\n");
        const result = streamText({
          model: responsesProvider().responses(CHAT_MODEL),
          system:
            `You answer questions about technical documents using ONLY the numbered context passages below.\n` +
            `Rules:\n- Every factual sentence must cite its passage(s) like [1] or [2][3].\n- Never use outside knowledge.\n` +
            `- If the passages don't contain the answer, reply exactly: "${NOT_FOUND}"\n- Be concise; use markdown lists/tables when helpful.\n\nContext:\n${context}`,
          messages: await convertToModelMessages(messages.slice(-6)),
          abortSignal: request.signal,
          providerOptions: LOW_REASONING,
        });
        writer.merge(result.toUIMessageStream({ sendReasoning: false }));
      },
      onError: (e) => (e instanceof Error ? e.message : "Something went wrong"),
    });
    return createUIMessageStreamResponse({ stream });
  } catch (e) {
    const status = e instanceof GatewayError ? e.status : 500;
    return Response.json({ error: e instanceof Error ? e.message : "Something went wrong" }, { status });
  }
}
