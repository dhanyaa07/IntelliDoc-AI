create extension if not exists vector;

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  file_hash text not null unique,
  page_count int not null default 0,
  low_text_pages int[] not null default '{}',
  chunk_count int not null default 0,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.documents to anon, authenticated;
grant all on public.documents to service_role;
alter table public.documents enable row level security;
create policy "demo access documents" on public.documents for all to anon, authenticated using (true) with check (true);

create table public.chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  chunk_index int not null,
  page int not null,
  char_start int not null,
  char_end int not null,
  content text not null,
  content_hash text not null unique,
  tsv tsvector generated always as (to_tsvector('english', content)) stored,
  embedding vector(3072),
  created_at timestamptz not null default now()
);
create index chunks_doc_idx on public.chunks(document_id);
create index chunks_tsv_idx on public.chunks using gin(tsv);
grant select, insert, update, delete on public.chunks to anon, authenticated;
grant all on public.chunks to service_role;
alter table public.chunks enable row level security;
create policy "demo access chunks" on public.chunks for all to anon, authenticated using (true) with check (true);