import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Transcribe a rendered PDF page image (tables, figures, scanned text) into plain text/markdown. */
export const readPageImage = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ image: z.string().startsWith("data:image/").max(8_000_000) }).parse(d))
  .handler(async ({ data }) => {
    const { streamText } = await import("ai");
    const { CHAT_MODEL, LOW_REASONING, responsesProvider } = await import("@/lib/rag/gateway.server");
    const r = streamText({
      model: responsesProvider().responses(CHAT_MODEL),
      system:
        "You transcribe document page images exactly. Output ALL readable text on the page verbatim. " +
        "Render every table as a markdown table with the same headers, rows and cell text (no summarizing, no added words). " +
        "For diagrams, list their labels. Never add information that is not visible. If the page has no readable content, output nothing.",
      messages: [{ role: "user", content: [{ type: "text", text: "Transcribe this page." }, { type: "image", image: new URL(data.image) }] }],
      providerOptions: LOW_REASONING,
    });
    return { text: (await r.text).trim() };
  });
