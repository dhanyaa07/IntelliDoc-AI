import { createOpenAI } from "@ai-sdk/openai";

export const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
export const CHAT_MODEL = "openai/gpt-6-astra";
export const EMBED_MODEL = "google/gemini-embedding-2";

export function apiKey(): string {
  const k = process.env['LOVABLE_API_KEY'];
  if (!k) throw new Error("AI is not configured (missing key).");
  return k;
}

export class GatewayError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Embed texts in batches; vectors aligned by returned index. */
export async function embed(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += 64) {
    const batch = texts.slice(i, i + 64);
    const res = await fetch(`${GATEWAY_URL}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey(), "X-Lovable-AIG-SDK": "fetch" },
      body: JSON.stringify({ model: EMBED_MODEL, input: batch }),
    });
    if (!res.ok) {
      const body = await res.text();
      let msg = body;
      try { msg = JSON.parse(body)?.error?.message ?? JSON.parse(body)?.message ?? body; } catch { /* keep text */ }
      throw new GatewayError(res.status, msg.slice(0, 300));
    }
    const json = (await res.json()) as { data: { index: number; embedding: number[] }[] };
    const vecs = new Array<number[]>(batch.length);
    for (const d of json.data) vecs[d.index] = d.embedding;
    out.push(...vecs);
  }
  return out;
}

export function responsesProvider() {
  const key = apiKey();
  return createOpenAI({
    baseURL: GATEWAY_URL,
    apiKey: key,
    headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
}

export const LOW_REASONING = {
  openai: {
    forceReasoning: true,
    reasoningEffort: "low",
    reasoningSummary: "auto",
    store: false,
    include: ["reasoning.encrypted_content"],
  },
} as const;
