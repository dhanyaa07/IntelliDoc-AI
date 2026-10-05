import { describe, expect, it } from "vitest";
import { chunkPages, cleanPageText, findRepeatedLines, splitText } from "./chunking";

describe("chunking", () => {
  it("keeps chunks at or under 800 chars", () => {
    const text = Array.from({ length: 300 }, (_, i) => `Sentence number ${i} about turbines.`).join(" ");
    const parts = splitText(text);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(p.length).toBeLessThanOrEqual(800);
  });

  it("overlaps consecutive chunks", () => {
    const text = Array.from({ length: 300 }, (_, i) => `w${i}`).join(" ");
    const [a, b] = splitText(text, 800, 150) as [string, string];
    const tail = a.slice(-50);
    expect(b.includes(tail.split(" ").slice(-2).join(" "))).toBe(true);
  });

  it("keeps page numbers on chunks", () => {
    const chunks = chunkPages([{ page: 1, text: "alpha" }, { page: 7, text: "beta" }]);
    expect(chunks.map((c) => c.page)).toEqual([1, 7]);
  });

  it("joins hyphenated words and drops page numbers", () => {
    expect(cleanPageText("trans-\nformer\n12")).toBe("transformer");
  });

  it("removes repeated headers", () => {
    const bodies = ["gearbox wear", "rotor speed", "blade pitch", "yaw control"];
    const pages = bodies.map((b, i) => ({ page: i + 1, text: `ACME Report\n${b}` }));
    const rep = findRepeatedLines(pages);
    expect(cleanPageText(pages[0]!.text, rep)).toBe("gearbox wear");
  });
});
