-- migration-13: admin-styrd resa (uppstartsmötesdatum, lansering) + ändringsförslag-tråd
-- Applicerad 2026-07-21.

alter table public.profiles add column if not exists meeting_at date;
alter table public.profiles add column if not exists launched_at timestamptz;
alter table public.profiles add column if not exists launch_url text;

-- Skydda de nya admin-styrda fälten mot kundändringar (utökar befintlig trigger-funktion)
create or replace function public.protect_profile_cols()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    new.approved := old.approved;
    new.is_admin := old.is_admin;
    new.website  := old.website;
    new.email    := old.email;
    new.meeting_at := old.meeting_at;
    new.launched_at := old.launched_at;
    new.launch_url := old.launch_url;
  end if;
  return new;
end;
$$;

-- Tvåvägs-tråd för ändringsförslag på steg 4 (sida & konfig)
create table if not exists public.site_change_proposals (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  author_role text not null check (author_role in ('admin','customer')),
  body text not null,
  created_at timestamptz not null default now()
);
alter table public.site_change_proposals enable row level security;
create policy "proposals: läs egna eller admin" on public.site_change_proposals
  for select using (user_id = auth.uid() or public.is_admin());
create policy "proposals: kund skapar eget" on public.site_change_proposals
  for insert with check (user_id = auth.uid() and author_role = 'customer');
create policy "proposals: admin skapar" on public.site_change_proposals
  for insert with check (public.is_admin() and author_role = 'admin');
