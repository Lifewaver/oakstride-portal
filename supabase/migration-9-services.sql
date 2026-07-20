-- Migration 9: Kundens tjänster (domän, e-post, hosting, betalväxel m.m.)
-- Admin registrerar och ser dem per kund i kunddetaljvyn. Körs efter migration-8.

create table if not exists public.customer_services (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'ovrigt' check (kind in ('doman','epost','hosting','betalvaxel','ovrigt')),
  name text not null,
  detail text,
  cost numeric(10,2),
  billing text check (billing in ('engang','manad','ar')),
  created_at timestamptz not null default now()
);
alter table public.customer_services enable row level security;

create policy "services: läs egna eller admin" on public.customer_services
  for select using (user_id = auth.uid() or public.is_admin());
create policy "services: admin hanterar" on public.customer_services
  for all using (public.is_admin()) with check (public.is_admin());
