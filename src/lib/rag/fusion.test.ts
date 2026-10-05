import { describe, expect, it } from "vitest";
import { rrfFuse, stripInvalidCitations, validateCitations } from "./fusion";

const h = (id: string) => ({ id, document_id: "d", page: 1, content: id, score: 0 });

describe("RRF fusion", () => {
  it("uses k=60 and sums ranks across lists", () => {
    const out = rrfFuse([h("a"), h("b")], [h("b"), h("c")]);
    const top = out[0]!;
    expect(top.id).toBe("b");
    expect(top.rrf).toBeCloseTo(1 / 62 + 1 / 61);
    expect(top.sources).toEqual(["dense", "keyword"]);
  });
  it("keeps items from one list only", () => {
    expect(rrfFuse([h("a")], []).map((x) => x.id)).toEqual(["a"]);
  });
});

describe("citations", () => {
  it("flags citations beyond the passage count", () => {
    expect(validateCitations("x [1] y [4] [2]", 3)).toEqual({ valid: [1, 2], invalid: [4] });
  });
  it("strips invalid citations", () => {
    expect(stripInvalidCitations("a [1] b [9]", 2)).toBe("a [1] b ");
  });
});
