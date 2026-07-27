-- =============================================================
-- Migration 16 – build_jobs (agent-byggflöde: "Bygg sajt")
-- Skapar jobbtabell för att generera kundsajter från Studio Kit.
-- =============================================================

do $$ begin
  create type public.build_status as enum
    ('queued','building','preview_ready','changes_requested','approved','published','failed');
exception when duplicate_object then null; end $$;

create table if not exists public.build_jobs (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id),
  slug        text not null,
  company     text not null,
  segment     text not null,
  brief       jsonb not null,
  status      public.build_status not null default 'queued',
  repo_url    text,
  preview_url text,
  commit_sha  text,
  error       text
);

create index if not exists build_jobs_status_idx on public.build_jobs (status);
create index if not exists build_jobs_created_idx on public.build_jobs (created_at desc);

-- updated_at (återanvänd befintlig touch-funktion om den finns, annars skapa)
create or replace function public.touch_build_jobs()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists build_jobs_touch on public.build_jobs;
create trigger build_jobs_touch before update on public.build_jobs
  for each row execute function public.touch_build_jobs();

-- Sätt created_by automatiskt
create or replace function public.set_build_job_owner()
returns trigger language plpgsql as $$
begin if new.created_by is null then new.created_by = auth.uid(); end if; return new; end $$;
drop trigger if exists build_jobs_owner on public.build_jobs;
create trigger build_jobs_owner before insert on public.build_jobs
  for each row execute function public.set_build_job_owner();

-- RLS: endast admin (samma mönster som övriga tabeller)
alter table public.build_jobs enable row level security;
drop policy if exists "build_jobs: admin hanterar" on public.build_jobs;
create policy "build_jobs: admin hanterar" on public.build_jobs
  for all using (public.is_admin()) with check (public.is_admin());

-- Service role (edge/agent) förbigår RLS automatiskt.
