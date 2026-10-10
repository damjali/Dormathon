-- Reference files a user uploads once and re-selects for later "Answer"
-- clicks on the TikTok Live dashboard, instead of re-uploading each time.
--
-- No Supabase CLI is wired up in this repo (see context.md) — run this by
-- pasting it into the Supabase project's SQL editor.

create table if not exists public.tiktok_reference_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  content_type text,
  size_bytes bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists tiktok_reference_files_user_id_idx
  on public.tiktok_reference_files (user_id);

alter table public.tiktok_reference_files enable row level security;

-- All reads/writes actually go through the service-role client in
-- app/api/tiktok/files (see lib/supabase/admin.ts), which bypasses RLS.
-- This policy exists so the table isn't silently open if anything ever
-- queries it with a user-scoped session instead.
create policy "Users manage their own tiktok reference files"
  on public.tiktok_reference_files
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Private bucket: files are only ever read via short-lived signed URLs
-- generated server-side when answering a question.
insert into storage.buckets (id, name, public)
values ('tiktok-reference-files', 'tiktok-reference-files', false)
on conflict (id) do nothing;
