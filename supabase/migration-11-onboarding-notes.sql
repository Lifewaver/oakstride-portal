-- Migration 11: Kundens egna kompletteringar per uppstartssteg (steg 3)
-- Kunden skriver direkt i portalen; admin läser. Körs efter migration-10.

create table if not exists public.onboarding_notes (
  user_id uuid not null references public.profiles(id) on delete cascade,
  step_no int not null,
  body text,
  updated_at timestamptz not null default now(),
  primary key (user_id, step_no)
);
alter table public.onboarding_notes enable row level security;

create policy "notes: kund hanterar egna" on public.onboarding_notes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notes: admin läser" on public.onboarding_notes
  for select using (public.is_admin());
