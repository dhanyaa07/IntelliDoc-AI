# IntelliDocs AI (web version)
- [x] M1 Ingestion: per-page extraction, cleanup, 800/150 chunking, hash dedupe, low-text flags
- [~] M2 Hybrid retrieval: semantic + keyword + RRF k=60, doc filter, toggles done; AI rerank + page-range filter pending
- [x] M3 Grounded generation: cited answers, confidence guardrail, follow-up rewriting, streaming, citation check
- [x] Accuracy (first pass): no hallucinations, answer anything in the uploaded docs (strict grounding, citation check, answer verification)
- [ ] M4 Compare, summarize, "why this answer" panel, Markdown export
- [ ] M5 Chat UI with sidebar settings
- [ ] M6 Evaluation tab (Hit@k, Recall@k, MRR, nDCG, 4-way comparison)
- [ ] M7/M8 Tests, docs
- [~] Read tables/figures/scanned pages from page images at upload (e.g. p.49 cloud vs fog table); prefer the passage that directly answers
