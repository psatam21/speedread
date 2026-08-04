-- Cross-device reading library / queue / profiles (JSON workspace blob per user)
create table if not exists public.reading_workspace (
  user_id uuid primary key references auth.users (id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.reading_workspace enable row level security;

create policy "reading_workspace_select_own"
  on public.reading_workspace for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "reading_workspace_insert_own"
  on public.reading_workspace for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "reading_workspace_update_own"
  on public.reading_workspace for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update on public.reading_workspace to authenticated;
