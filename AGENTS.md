<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture
- PDF parsing runs in the browser (pdfjs) and pure chunking logic lives in src/lib/ingest/chunking.ts — keeps server Worker free of heavy deps and logic unit-testable.
- Chunks are stored per page with content hashes for dedupe; vector + full-text columns live on the same chunks table for hybrid retrieval.
