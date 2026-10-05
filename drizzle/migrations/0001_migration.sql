create or replace function public.match_chunks_dense(query_embedding vector(3072), doc_ids uuid[], match_count int)
returns table (id uuid, document_id uuid, page int, content text, score float)
language sql stable set search_path = public as $$
  select c.id, c.document_id, c.page, c.content, 1 - (c.embedding <=> query_embedding) as score
  from public.chunks c
  where c.embedding is not null and (doc_ids is null or c.document_id = any(doc_ids))
  order by c.embedding <=> query_embedding
  limit match_count
$$;

create or replace function public.match_chunks_text(query_text text, doc_ids uuid[], match_count int)
returns table (id uuid, document_id uuid, page int, content text, score float)
language sql stable set search_path = public as $$
  select c.id, c.document_id, c.page, c.content, ts_rank_cd(c.tsv, q)::float as score
  from public.chunks c, websearch_to_tsquery('english', query_text) q0,
       lateral (select to_tsquery('english', coalesce(nullif(replace(querytree(q0), '&', '|'), 'T'), '')) as q) qq
  where c.tsv @@ q and (doc_ids is null or c.document_id = any(doc_ids))
  order by score desc
  limit match_count
$$;

grant execute on function public.match_chunks_dense(vector, uuid[], int) to anon, authenticated, service_role;
grant execute on function public.match_chunks_text(text, uuid[], int) to anon, authenticated, service_role;