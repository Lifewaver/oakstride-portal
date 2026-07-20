-- Migration 8: Projektförfrågningar från oakstride.se/studio (brief-formulär)
-- Publikt insättbart (som page_views/consents); admin läser i portalen.
-- Varje inskick är även en ansökan om portalåtkomst. Körs efter migration-7.

create table if not exists public.project_briefs (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null,
  company text,
  description text not null,
  example_sites text,
  wants_portal boolean not null default true,
  status text not null default 'new' check (status in ('new','contacted','converted','archived')),
  linked_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.project_briefs enable row level security;

-- Vem som helst får skicka in en förfrågan (med rimliga längdgränser); ingen får läsa via API utom admin.
create policy "briefs: öppen insert" on public.project_briefs
  for insert to anon, authenticated
  with check (
    char_length(name) between 1 and 120
    and char_length(email) between 3 and 160 and position('@' in email) > 1
    and char_length(description) between 1 and 5000
    and (company is null or char_length(company) <= 160)
    and (example_sites is null or char_length(example_sites) <= 2000)
  );
create policy "briefs: admin läser" on public.project_briefs for select using (public.is_admin());
create policy "briefs: admin uppdaterar" on public.project_briefs for update using (public.is_admin());

-- Avisera OakStride när en förfrågan kommer in.
create or replace function public.notify_brief()
returns trigger language plpgsql security definer set search_path = public as $$
declare api_key text;
begin
  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'resend_api_key';
  if api_key is null then return new; end if;
  begin
    perform net.http_post(
      url := 'https://api.resend.com/emails',
      body := jsonb_build_object(
        'from', 'OakStride Portal <portal@oakstride.se>',
        'to', jsonb_build_array('info@oakstride.se'),
        'subject', 'Ny projektförfrågan: ' || coalesce(new.company, new.name),
        'html', '<h2>Ny projektförfrågan från oakstride.se</h2>'
          || '<p><strong>Namn:</strong> ' || public.esc_html(new.name)
          || coalesce(' (' || public.esc_html(new.company) || ')', '') || '<br>'
          || '<strong>E-post:</strong> ' || public.esc_html(new.email) || '</p>'
          || '<p><strong>Beskrivning:</strong><br><span style="white-space:pre-wrap">' || public.esc_html(new.description) || '</span></p>'
          || coalesce('<p><strong>Exempelsajter:</strong><br><span style="white-space:pre-wrap">' || public.esc_html(new.example_sites) || '</span></p>', '')
          || case when new.wants_portal then '<p>Kunden har även ansökt om inloggning till kundportalen.</p>' else '' end
          || '<p><a href="https://portal.oakstride.se">Öppna portalen</a></p>'
      ),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || api_key)
    );
  exception when others then null;
  end;
  return new;
end; $$;

create trigger notify_brief_new after insert on public.project_briefs
  for each row execute function public.notify_brief();
