-- Migration 6: Uppstartsflöde för nya kunder + tillägg (add-ons)
-- Kunden ser stegen vi tar för att sätta upp sidan, och kan beställa eller
-- avböja tillägg (t.ex. e-post) som OakStride föreslår med pris. Beställningar
-- loggas och mejlas. Körs efter migration-5.

-- Vilket uppstartssteg kunden befinner sig på (1..7). Admin flyttar fram det.
alter table public.profiles add column if not exists onboarding_stage int not null default 1;

-- ---------- Tillägg (add-ons) ----------

create table if not exists public.addons (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  price numeric(10,2) not null default 0,          -- kr exkl. moms
  billing text not null default 'engang' check (billing in ('engang','manad')),
  status text not null default 'proposed' check (status in ('proposed','ordered','declined')),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
alter table public.addons enable row level security;

create policy "addons: läs egna eller admin" on public.addons
  for select using (user_id = auth.uid() or public.is_admin());
create policy "addons: admin skapar" on public.addons
  for insert with check (public.is_admin());
create policy "addons: admin uppdaterar" on public.addons
  for update using (public.is_admin()) with check (public.is_admin());
create policy "addons: kund beslutar eget" on public.addons
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "addons: admin raderar" on public.addons
  for delete using (public.is_admin());

-- Kunden får bara flytta ett förslag till beställt/avböjt — allt annat återställs.
create or replace function public.protect_addon_cols()
returns trigger language plpgsql security definer set search_path = public as $$
declare wanted text;
begin
  if auth.uid() is not null and not public.is_admin() then
    wanted := new.status;
    new := old;
    if old.status = 'proposed' and wanted in ('ordered','declined') then
      new.status := wanted;
      new.decided_at := now();
    end if;
  end if;
  return new;
end; $$;
create trigger protect_addon_cols before update on public.addons
  for each row execute function public.protect_addon_cols();

-- ---------- Mejlaviseringar för tillägg ----------

create or replace function public.notify_addon()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  api_key text; who record; subj text; html text; to_addr text; pricetxt text;
begin
  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'resend_api_key';
  if api_key is null then return new; end if;
  pricetxt := trim(to_char(new.price, 'FM999G999G990D00')) || ' kr'
           || (case when new.billing = 'manad' then '/mån' else ' (engång)' end);

  if tg_op = 'INSERT' then
    select email into who from public.profiles where id = new.user_id;
    to_addr := who.email;
    subj := 'Nytt tillägg att ta ställning till: ' || new.title;
    html := '<h2>Ett tillägg väntar på ditt beslut</h2>'
      || '<p><strong>' || public.esc_html(new.title) || '</strong> — ' || public.esc_html(pricetxt) || '</p>'
      || coalesce('<p>' || public.esc_html(new.description) || '</p>', '')
      || '<p>Logga in i <a href="https://portal.oakstride.se">portalen</a> för att beställa eller avböja.</p>';
  elsif tg_op = 'UPDATE' and new.status = 'ordered' then
    select email, full_name into who from public.profiles where id = new.user_id;
    to_addr := 'info@oakstride.se';
    subj := 'Tillägg beställt: ' || new.title;
    html := '<h2>Kund har beställt ett tillägg</h2>'
      || '<p>' || public.esc_html(coalesce(who.full_name, who.email)) || ' beställde <strong>'
      || public.esc_html(new.title) || '</strong> (' || public.esc_html(pricetxt) || ').</p>'
      || '<p><a href="https://portal.oakstride.se">Öppna portalen</a></p>';
  elsif tg_op = 'UPDATE' and new.status = 'declined' then
    select email, full_name into who from public.profiles where id = new.user_id;
    to_addr := 'info@oakstride.se';
    subj := 'Tillägg avböjt: ' || new.title;
    html := '<h2>Kund avböjde ett tillägg</h2>'
      || '<p>' || public.esc_html(coalesce(who.full_name, who.email)) || ' avböjde <strong>'
      || public.esc_html(new.title) || '</strong>.</p>';
  else
    return new;
  end if;

  begin
    perform net.http_post(
      url := 'https://api.resend.com/emails',
      body := jsonb_build_object(
        'from', 'OakStride Portal <portal@oakstride.se>',
        'to', jsonb_build_array(to_addr),
        'subject', subj,
        'html', html
      ),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || api_key)
    );
  exception when others then null;
  end;
  return new;
end; $$;

create trigger notify_addon_proposed after insert on public.addons
  for each row execute function public.notify_addon();
create trigger notify_addon_decided after update of status on public.addons
  for each row when (old.status is distinct from new.status)
  execute function public.notify_addon();
