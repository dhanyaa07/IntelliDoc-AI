/** Pure retrieval helpers: RRF fusion and citation validation. */

export interface Hit {
  id: string;
  document_id: string;
  page: number;
  content: string;
  score: number;
}

export interface FusedHit extends Hit {
  rrf: number;
  sources: ("dense" | "keyword")[];
  denseRank?: number;
  keywordRank?: number;
}

export const RRF_K = 60;

/** Reciprocal Rank Fusion: score = sum 1/(k + rank) over each list where the item appears. */
export function rrfFuse(dense: Hit[], keyword: Hit[], k = RRF_K): FusedHit[] {
  const map = new Map<string, FusedHit>();
  const add = (list: Hit[], src: "dense" | "keyword") =>
    list.forEach((h, i) => {
      const rank = i + 1;
      const cur = map.get(h.id) ?? { ...h, rrf: 0, sources: [] };
      cur.rrf += 1 / (k + rank);
      cur.sources.push(src);
      if (src === "dense") cur.denseRank = rank;
      else cur.keywordRank = rank;
      map.set(h.id, cur);
    });
  add(dense, "dense");
  add(keyword, "keyword");
  return [...map.values()].sort((a, b) => b.rrf - a.rrf);
}

export const NOT_FOUND = "I couldn't find this in the uploaded documents.";

/** Find [n] citations; split into those mapping to a real passage (1..n) and invalid ones. */
export function validateCitations(answer: string, passageCount: number) {
  const nums = [...answer.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]));
  const valid = [...new Set(nums.filter((n) => n >= 1 && n <= passageCount))];
  const invalid = [...new Set(nums.filter((n) => n < 1 || n > passageCount))];
  return { valid, invalid };
}

/** Remove citations that don't map to any passage. */
export function stripInvalidCitations(answer: string, passageCount: number): string {
  return answer.replace(/\[(\d+)\]/g, (m, n) => (Number(n) >= 1 && Number(n) <= passageCount ? m : ""));
}

/** Expand model citation numbers with the page stored for each retrieved passage. */
export function annotateCitations(answer: string, passages: { n: number; page: number }[]): string {
  const pages = new Map(passages.map((passage) => [passage.n, passage.page]));
  return answer.replace(/\[(\d+)\]/g, (_, number: string) => {
    const n = Number(number);
    const page = pages.get(n);
    return page === undefined ? "" : `[${n}, p. ${page}]`;
  });
}
