-- RAG for reference files: each uploaded file is split into chunks and
-- embedded (384-dim, Xenova/all-MiniLM-L6-v2 — see lib/tiktok/embeddings.ts)
-- so a viewer's question can pull in just the relevant sentences instead of
-- attaching the whole document to every WorkBuddy run. Replaces the
-- url/local-path attachment approach for files entirely (see context.md —
-- both had serious latency/reliability problems).
--
-- No Supabase CLI wired up in this repo — run this in the SQL editor, same
-- as the other migrations.

create extension if not exists vector;

create table if not exists public.tiktok_reference_chunks (
  id uuid primary key default gen_random_uuid(),
  file_id uuid not null references public.tiktok_reference_files (id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(384) not null,
  created_at timestamptz not null default now()
);

create index if not exists tiktok_reference_chunks_file_id_idx
  on public.tiktok_reference_chunks (file_id);

create index if not exists tiktok_reference_chunks_embedding_idx
  on public.tiktok_reference_chunks
  using hnsw (embedding vector_cosine_ops);

alter table public.tiktok_reference_chunks enable row level security;

-- Same posture as tiktok_reference_files: all access actually goes through
-- the service-role client, this is just a backstop.
create policy "Anyone can manage tiktok reference chunks"
  on public.tiktok_reference_chunks
  for all
  using (true)
  with check (true);

-- Cosine-similarity top-K search, optionally restricted to a set of file ids
-- (the host's current file selection). SQL function (not PL/pgSQL) so the
-- planner can inline it.
create or replace function match_reference_chunks(
  query_embedding vector(384),
  match_count int default 6,
  filter_file_ids uuid[] default null
)
returns table (id uuid, file_id uuid, content text, similarity float)
language sql stable
as $$
  select
    c.id,
    c.file_id,
    c.content,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.tiktok_reference_chunks c
  where filter_file_ids is null or c.file_id = any(filter_file_ids)
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
