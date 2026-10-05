import { createServerFn } from "@tanstack/react-start";

/** Embed every chunk that doesn't have a vector yet. Returns how many were embedded. */
export const embedPendingChunks = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { embed } = await import("./gateway.server");
  let total = 0;
  for (let round = 0; round < 20; round++) {
    const { data, error } = await supabaseAdmin.from("chunks").select("id, content").is("embedding", null).limit(128);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    const vecs = await embed(data.map((c) => c.content));
    await Promise.all(
      data.map((c, i) => supabaseAdmin.from("chunks").update({ embedding: JSON.stringify(vecs[i]) }).eq("id", c.id)),
    );
    total += data.length;
  }
  return { embedded: total };
});
