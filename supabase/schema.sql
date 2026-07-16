-- OakStride Portal — databas-schema för Supabase
-- Körs i Supabase SQL Editor. Idempotent nog att köras en gång per projekt.

-- Behövs för mejlaviseringar (HTTP-anrop till Resend från databasen)
create extension if not exists pg_net;

-- ---------- Tabeller ----------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  company text,
  website text,
  approved boolean not null default false,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.requests (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  page_url text,
  description text not null,
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  status text not null default 'new' check (status in ('new','in_progress','waiting_customer','done')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.request_comments (
  id bigint generated always as identity primary key,
  request_id bigint not null references public.requests(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- ---------- Hjälpfunktioner ----------

-- security definer så att RLS-policies kan kolla admin-flaggan utan rekursion
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

-- Skapa profil automatiskt när en användare loggar in första gången
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Kunder får bara ändra namn/företag på sin egen profil — aldrig approved/is_admin/website
create or replace function public.protect_profile_cols()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    new.approved := old.approved;
    new.is_admin := old.is_admin;
    new.website  := old.website;
    new.email    := old.email;
  end if;
  return new;
end;
$$;

create trigger protect_profile_cols
  before update on public.profiles
  for each row execute function public.protect_profile_cols();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger requests_updated_at
  before update on public.requests
  for each row execute function public.set_updated_at();

-- ---------- Row Level Security ----------

alter table public.profiles enable row level security;
alter table public.requests enable row level security;
alter table public.request_comments enable row level security;

create policy "profiles: läs egen eller admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

create policy "profiles: uppdatera egen eller admin" on public.profiles
  for update using (id = auth.uid() or public.is_admin());

create policy "requests: läs egna eller admin" on public.requests
  for select using (user_id = auth.uid() or public.is_admin());

create policy "requests: skapa om godkänd" on public.requests
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and (p.approved or p.is_admin))
  );

create policy "requests: admin uppdaterar" on public.requests
  for update using (public.is_admin());

create policy "comments: läs egna ärendens eller admin" on public.request_comments
  for select using (
    public.is_admin()
    or exists (select 1 from public.requests r where r.id = request_id and r.user_id = auth.uid())
  );

create policy "comments: skriv i egna ärenden eller admin" on public.request_comments
  for insert with check (
    author_id = auth.uid()
    and (
      public.is_admin()
      or exists (
        select 1 from public.requests r
        join public.profiles p on p.id = auth.uid()
        where r.id = request_id and r.user_id = auth.uid() and p.approved
      )
    )
  );

-- ---------- Mejlaviseringar via Resend ----------
-- Kräver: (1) Resend-konto med oakstride.se verifierad, (2) API-nyckeln sparad i
-- Supabase Vault:  select vault.create_secret('re_XXXX', 'resend_api_key');

create or replace function public.esc_html(t text)
returns text language sql immutable as $$
  select replace(replace(replace(t, '&', '&amp;'), '<', '&lt;'), '>', '&gt;')
$$;

create or replace function public.notify_email()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  payload jsonb;
  who record;
  api_key text;
  subj text;
  html text;
begin
  select decrypted_secret into api_key
    from vault.decrypted_secrets where name = 'resend_api_key';
  if api_key is null then
    return new; -- ingen nyckel konfigurerad ännu → hoppa tyst över avisering
  end if;

  if tg_table_name = 'requests' then
    select email, full_name, company into who from public.profiles where id = new.user_id;
    subj := 'Nytt ärende #' || new.id || ': ' || new.title;
    html := '<h2>Nytt ärende i portalen</h2>'
      || '<p><strong>Kund:</strong> ' || public.esc_html(coalesce(who.full_name, who.email))
      || coalesce(' (' || public.esc_html(who.company) || ')', '') || '<br>'
      || '<strong>Prioritet:</strong> ' || public.esc_html(new.priority)
      || coalesce('<br><strong>Sida:</strong> ' || public.esc_html(new.page_url), '') || '</p>'
      || '<p style="white-space:pre-wrap">' || public.esc_html(new.description) || '</p>'
      || '<p><a href="https://portal.oakstride.se">Öppna portalen</a></p>';
  elsif tg_table_name = 'profiles' then
    subj := 'Ny registrering i portalen: ' || new.email;
    html := '<h2>Nytt konto väntar på godkännande</h2>'
      || '<p>' || coalesce(public.esc_html(new.full_name), '') || ' &lt;' || public.esc_html(new.email) || '&gt;</p>'
      || '<p><a href="https://portal.oakstride.se">Godkänn i portalen</a></p>';
  elsif tg_table_name = 'request_comments' then
    -- Avisera bara när KUNDEN skriver (inte när admin svarar)
    if (select is_admin from public.profiles where id = new.author_id) then
      return new;
    end if;
    select p.email, p.full_name into who
      from public.profiles p where p.id = new.author_id;
    subj := 'Nytt svar på ärende #' || new.request_id || ' från ' || coalesce(who.full_name, who.email);
    html := '<h2>Ny kommentar från kund</h2>'
      || '<p style="white-space:pre-wrap">' || public.esc_html(new.body) || '</p>'
      || '<p><a href="https://portal.oakstride.se">Svara i portalen</a></p>';
  end if;

  payload := jsonb_build_object(
    'from', 'OakStride Portal <portal@oakstride.se>',
    'to', jsonb_build_array('info@oakstride.se'),
    'subject', subj,
    'html', html
  );

  begin
    perform net.http_post(
      url := 'https://api.resend.com/emails',
      body := payload,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || api_key
      )
    );
  exception when others then
    null; -- aviseringsfel får aldrig blockera själva ärendet
  end;
  return new;
end;
$$;

create trigger notify_new_request after insert on public.requests
  for each row execute function public.notify_email();
create trigger notify_new_signup after insert on public.profiles
  for each row execute function public.notify_email();
create trigger notify_new_comment after insert on public.request_comments
  for each row execute function public.notify_email();

-- ---------- Admin-konto ----------
-- Kör EFTER att Fredrik loggat in första gången i portalen:
-- update public.profiles set is_admin = true, approved = true
--   where email in ('info@oakstride.se', 'fredrik@oakstride.se', 'fredrik.aasberg@gmail.com');
