-- Migration 12: Versionshanterad kravspecifikation per kund (standardformat).
-- Standard vs extra, byggs på genom flödet, versioneras från steg 3.
-- Admin äger specen; kunden kan skapa en ny version vid komplettering (steg 3).
-- Körs efter migration-11.

-- Transkribering från uppstartsmötet (internt underlag, syns ej för kund).
alter table public.onboarding_content add column if not exists transcript text;

create table if not exists public.requirement_specs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  version int not null,
  data jsonb not null default '{}'::jsonb,
  change_note text,
  source text not null default 'admin' check (source in ('baslinje', 'admin', 'kund')),
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (user_id, version)
);
alter table public.requirement_specs enable row level security;

create policy "spec: läs egna eller admin" on public.requirement_specs
  for select using (user_id = auth.uid() or public.is_admin());
create policy "spec: admin hanterar" on public.requirement_specs
  for all using (public.is_admin()) with check (public.is_admin());

-- Kunden skapar en ny version vid komplettering/ändring (från steg 3).
-- Forward-kopierar senaste datan och loggar kundens ändring som change_note.
-- Kräver en baslinje (admin har skapat spec). Dedupe mot senaste kundändring.
create or replace function public.add_customer_spec_version(p_complement text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_latest requirement_specs;
  v_new_id bigint;
begin
  if p_complement is null or length(trim(p_complement)) = 0 then
    return null;
  end if;
  select * into v_latest from requirement_specs
    where user_id = auth.uid() order by version desc limit 1;
  if v_latest.id is null then
    return null;
  end if;
  if v_latest.source = 'kund' and coalesce(v_latest.change_note, '') = trim(p_complement) then
    return v_latest.id;
  end if;
  insert into requirement_specs (user_id, version, data, change_note, source, created_by)
    values (auth.uid(), v_latest.version + 1, v_latest.data, trim(p_complement), 'kund', auth.uid())
    returning id into v_new_id;
  return v_new_id;
end;
$$;
grant execute on function public.add_customer_spec_version(text) to authenticated;
