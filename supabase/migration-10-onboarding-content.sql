-- Migration 10: Material per uppstartssteg + kunden läser sin egen projektförfrågan
-- Nya 6-stegsflödet: admin lägger upp sammanfattning (steg 3), kravbild (steg 4)
-- och utkastlänk (steg 5); kunden verifierar. Körs efter migration-9.

create table if not exists public.onboarding_content (
  user_id uuid not null references public.profiles(id) on delete cascade,
  step_no int not null,
  body text,
  link text,
  updated_at timestamptz not null default now(),
  primary key (user_id, step_no)
);
alter table public.onboarding_content enable row level security;

create policy "content: läs egna eller admin" on public.onboarding_content
  for select using (user_id = auth.uid() or public.is_admin());
create policy "content: admin hanterar" on public.onboarding_content
  for all using (public.is_admin()) with check (public.is_admin());

-- Steg 1 = kundens projektförfrågan. Låt kunden läsa sin egen (matchat på e-post
-- eller kopplat konto). Admin har redan en egen läspolicy.
create policy "briefs: kund läser egna" on public.project_briefs
  for select using (
    linked_user_id = auth.uid()
    or email in (select p.email from public.profiles p where p.id = auth.uid())
  );
