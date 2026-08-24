-- Night Ops authentication and shared-data schema.
-- Safe to keep in the public repository: it contains no credentials.

create extension if not exists pgcrypto;
create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Member' check (char_length(display_name) between 1 and 80),
  role text not null default 'member' check (role in ('member', 'lead')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{"packing":{},"practice":{},"currentLesson":{},"reflections":{}}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  content text not null check (char_length(content) between 1 and 2000),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.training_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  starts_at timestamptz not null,
  location text not null default '' check (char_length(location) <= 300),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  content text not null check (char_length(content) between 1 and 2000),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text;
begin
  requested_name := left(trim(coalesce(new.raw_user_meta_data ->> 'display_name', 'Member')), 80);
  if requested_name = '' then requested_name := 'Member'; end if;

  insert into public.profiles (id, display_name)
  values (new.id, requested_name)
  on conflict (id) do nothing;

  insert into public.training_state (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure private.handle_new_user();

create or replace function private.is_lead()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'lead'
  );
$$;

drop trigger if exists profiles_updated_at on public.profiles;
create trigger profiles_updated_at before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists training_state_updated_at on public.training_state;
create trigger training_state_updated_at before update on public.training_state
for each row execute procedure public.set_updated_at();

drop trigger if exists announcements_updated_at on public.announcements;
create trigger announcements_updated_at before update on public.announcements
for each row execute procedure public.set_updated_at();

drop trigger if exists training_events_updated_at on public.training_events;
create trigger training_events_updated_at before update on public.training_events
for each row execute procedure public.set_updated_at();

drop trigger if exists questions_updated_at on public.questions;
create trigger questions_updated_at before update on public.questions
for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.training_state enable row level security;
alter table public.announcements enable row level security;
alter table public.training_events enable row level security;
alter table public.questions enable row level security;

revoke all on table public.profiles, public.training_state, public.announcements,
  public.training_events, public.questions from anon, authenticated;
revoke all on function private.handle_new_user() from public, anon, authenticated;
revoke all on function private.is_lead() from public, anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;
grant select, insert, update on table public.training_state to authenticated;
grant select, insert, update, delete on table public.announcements,
  public.training_events, public.questions to authenticated;
grant usage on schema private to authenticated;
grant execute on function private.is_lead() to authenticated;

drop policy if exists "Read own profile or lead reads profiles" on public.profiles;
create policy "Read own profile or lead reads profiles"
on public.profiles for select to authenticated
using ((select auth.uid()) = id or (select private.is_lead()));

drop policy if exists "Update own display name" on public.profiles;
create policy "Update own display name"
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Read own training or lead reads training" on public.training_state;
create policy "Read own training or lead reads training"
on public.training_state for select to authenticated
using ((select auth.uid()) = user_id or (select private.is_lead()));

drop policy if exists "Insert own training" on public.training_state;
create policy "Insert own training"
on public.training_state for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Update own training" on public.training_state;
create policy "Update own training"
on public.training_state for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Members read announcements" on public.announcements;
create policy "Members read announcements"
on public.announcements for select to authenticated
using (true);

drop policy if exists "Leads add announcements" on public.announcements;
create policy "Leads add announcements"
on public.announcements for insert to authenticated
with check ((select private.is_lead()) and created_by = (select auth.uid()));

drop policy if exists "Leads edit announcements" on public.announcements;
create policy "Leads edit announcements"
on public.announcements for update to authenticated
using ((select private.is_lead()))
with check ((select private.is_lead()));

drop policy if exists "Leads delete announcements" on public.announcements;
create policy "Leads delete announcements"
on public.announcements for delete to authenticated
using ((select private.is_lead()));

drop policy if exists "Members read training events" on public.training_events;
create policy "Members read training events"
on public.training_events for select to authenticated
using (true);

drop policy if exists "Leads add training events" on public.training_events;
create policy "Leads add training events"
on public.training_events for insert to authenticated
with check ((select private.is_lead()) and created_by = (select auth.uid()));

drop policy if exists "Leads edit training events" on public.training_events;
create policy "Leads edit training events"
on public.training_events for update to authenticated
using ((select private.is_lead()))
with check ((select private.is_lead()));

drop policy if exists "Leads delete training events" on public.training_events;
create policy "Leads delete training events"
on public.training_events for delete to authenticated
using ((select private.is_lead()));

drop policy if exists "Members read questions" on public.questions;
create policy "Members read questions"
on public.questions for select to authenticated
using (true);

drop policy if exists "Members ask questions" on public.questions;
create policy "Members ask questions"
on public.questions for insert to authenticated
with check (created_by = (select auth.uid()));

drop policy if exists "Owners or leads edit questions" on public.questions;
create policy "Owners or leads edit questions"
on public.questions for update to authenticated
using (created_by = (select auth.uid()) or (select private.is_lead()))
with check (created_by = (select auth.uid()) or (select private.is_lead()));

drop policy if exists "Owners or leads delete questions" on public.questions;
create policy "Owners or leads delete questions"
on public.questions for delete to authenticated
using (created_by = (select auth.uid()) or (select private.is_lead()));

-- Remove earlier public helper versions if this script is rerun as a migration.
drop function if exists public.handle_new_user();
drop function if exists public.is_lead();

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;
