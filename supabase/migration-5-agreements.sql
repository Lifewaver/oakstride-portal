-- Migration 5: Elektroniskt avtalsgodkännande i portalen
-- Kunden bockar i och godkänner kundvillkoren; varje godkännande loggas
-- oföränderligt (vem, när, vilken version, hash av exakt visad text) och
-- en bekräftelse mejlas till kund + OakStride. Körs efter migration-2/3/4.

-- ---------- Logg över godkännanden (oföränderlig) ----------

create table if not exists public.agreement_acceptances (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  agreement_version text not null,
  document_title text not null,
  document_hash text not null,          -- SHA-256 (hex) av exakt den villkorstext kunden såg
  user_agent text,
  ip inet,                              -- fylls i best-effort (t.ex. via edge function) senare
  accepted_at timestamptz not null default now(),
  unique (user_id, agreement_version)   -- ett godkännande per version och kund
);

alter table public.agreement_acceptances enable row level security;

-- Kunden får läsa sina egna godkännanden; admin ser alla.
create policy "acceptances: läs egna eller admin" on public.agreement_acceptances
  for select using (user_id = auth.uid() or public.is_admin());

-- Kunden får registrera sitt eget godkännande. Ingen update/delete-policy finns
-- (default deny) → raden är oföränderlig även för kunden själv.
create policy "acceptances: skapa eget" on public.agreement_acceptances
  for insert with check (user_id = auth.uid());

-- ---------- Bekräftelsemejl vid godkännande ----------
-- Utökar notify_email() med en gren för agreement_acceptances. Behåller alla
-- befintliga grenar (requests, profiles, request_comments) oförändrade och
-- inför stöd för flera mottagare via to_arr.

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
  to_addr text := 'info@oakstride.se';
  to_arr jsonb := null;
begin
  select decrypted_secret into api_key
    from vault.decrypted_secrets where name = 'resend_api_key';
  if api_key is null then
    return new;
  end if;

  if tg_table_name = 'requests' and tg_op = 'INSERT' then
    select email, full_name, company into who from public.profiles where id = new.user_id;
    subj := 'Nytt ärende #' || new.id || ': ' || new.title;
    html := '<h2>Nytt ärende i portalen</h2>'
      || '<p><strong>Kund:</strong> ' || public.esc_html(coalesce(who.full_name, who.email))
      || coalesce(' (' || public.esc_html(who.company) || ')', '') || '<br>'
      || '<strong>Prioritet:</strong> ' || public.esc_html(new.priority)
      || coalesce('<br><strong>Sida:</strong> ' || public.esc_html(new.page_url), '') || '</p>'
      || '<p style="white-space:pre-wrap">' || public.esc_html(new.description) || '</p>'
      || '<p><a href="https://portal.oakstride.se">Öppna portalen</a></p>';

  elsif tg_table_name = 'requests' and tg_op = 'UPDATE' then
    select email, full_name into who from public.profiles where id = new.user_id;
    if new.status = 'draft_ready' then
      to_addr := who.email;
      subj := 'Ditt förslag är klart att granska — ärende #' || new.id;
      html := '<h2>Förslaget för "' || public.esc_html(new.title) || '" är klart!</h2>'
        || coalesce('<p><a href="' || public.esc_html(new.preview_url) || '">Se förhandsvisningen här</a></p>', '')
        || '<p>Logga in i <a href="https://portal.oakstride.se">portalen</a> för att godkänna eller begära ändringar.</p>';
    elsif new.status = 'questions' then
      to_addr := who.email;
      subj := 'Vi har frågor om ditt ärende #' || new.id;
      html := '<h2>Några frågor innan vi bygger vidare</h2>'
        || '<p>Ärendet "' || public.esc_html(new.title) || '" har fått frågor som väntar på dina svar.</p>'
        || '<p><a href="https://portal.oakstride.se">Svara i portalen</a></p>';
    elsif new.status = 'approved' then
      subj := 'Kund har godkänt förslag — ärende #' || new.id;
      html := '<h2>Godkänt av kund</h2>'
        || '<p>' || public.esc_html(coalesce(who.full_name, who.email)) || ' har godkänt förslaget för "'
        || public.esc_html(new.title) || '". Dags att publicera!</p>'
        || coalesce('<p><a href="' || public.esc_html(new.preview_url) || '">Förhandsvisning</a></p>', '')
        || '<p><a href="https://portal.oakstride.se">Öppna portalen</a></p>';
    else
      return new;
    end if;

  elsif tg_table_name = 'agreement_acceptances' then
    select email, full_name into who from public.profiles where id = new.user_id;
    to_arr := jsonb_build_array(who.email, 'info@oakstride.se');
    subj := 'Bekräftelse: avtal godkänt (' || new.agreement_version || ')';
    html := '<h2>Tack! Ditt avtal är godkänt</h2>'
      || '<p>' || public.esc_html(coalesce(who.full_name, who.email))
      || ' godkände <strong>' || public.esc_html(new.document_title)
      || '</strong> (version ' || public.esc_html(new.agreement_version) || ') den '
      || to_char(new.accepted_at, 'YYYY-MM-DD" kl. "HH24:MI') || '.</p>'
      || '<p>Detta mejl är din bekräftelse på godkännandet. De fullständiga villkoren finns alltid tillgängliga i <a href="https://portal.oakstride.se">kundportalen</a>.</p>'
      || '<p style="color:#888;font-size:12px">Verifiering (dokument-hash): ' || public.esc_html(new.document_hash) || '</p>';

  elsif tg_table_name = 'profiles' then
    subj := 'Ny registrering i portalen: ' || new.email;
    html := '<h2>Nytt konto väntar på godkännande</h2>'
      || '<p>' || coalesce(public.esc_html(new.full_name), '') || ' &lt;' || public.esc_html(new.email) || '&gt;</p>'
      || '<p><a href="https://portal.oakstride.se">Godkänn i portalen</a></p>';

  elsif tg_table_name = 'request_comments' then
    if new.author_id is null then
      select p.email into who from public.requests r
        join public.profiles p on p.id = r.user_id where r.id = new.request_id;
      to_addr := who.email;
      subj := 'Ny fråga om ditt ärende #' || new.request_id;
      html := '<h2>Vi behöver din input</h2>'
        || '<p style="white-space:pre-wrap">' || public.esc_html(new.body) || '</p>'
        || '<p><a href="https://portal.oakstride.se">Svara i portalen</a></p>';
    else
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
  end if;

  payload := jsonb_build_object(
    'from', 'OakStride Portal <portal@oakstride.se>',
    'to', coalesce(to_arr, jsonb_build_array(to_addr)),
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
    null;
  end;
  return new;
end;
$$;

create trigger notify_agreement_accepted after insert on public.agreement_acceptances
  for each row execute function public.notify_email();
