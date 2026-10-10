-- Reference files are shared across everyone using this tool (no login
-- wall), not scoped per Supabase user — drop the per-user ownership model
-- from the first migration.

alter table public.tiktok_reference_files
  drop constraint if exists tiktok_reference_files_user_id_fkey;

alter table public.tiktok_reference_files
  alter column user_id drop not null;

drop policy if exists "Users manage their own tiktok reference files" on public.tiktok_reference_files;

-- All access still actually goes through the service-role client in
-- app/api/tiktok/files (bypasses RLS) — this policy just keeps the table
-- honest about there being no per-user restriction, in case anything ever
-- queries it with a user-scoped session.
create policy "Anyone can manage tiktok reference files"
  on public.tiktok_reference_files
  for all
  using (true)
  with check (true);
