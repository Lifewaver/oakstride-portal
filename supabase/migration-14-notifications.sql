-- migration-14: e-postaviseringar för utkast, ändringsförslag och lansering
-- Applicerad 2026-07-22. Isolerade trigger-funktioner (rör ej delade notify_email).

-- Gemensam hjälpfunktion (samma Resend-mönster som notify_email)
create or replace function public.oak_send_email(to_addr text, subj text, html text)
returns void language plpgsql security definer set search_path = public as $$
declare api_key text;
begin
  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'resend_api_key';
  if api_key is null or to_addr is null then return; end if;
  begin
    perform net.http_post(
      url := 'https://api.resend.com/emails',
      body := jsonb_build_object(
        'from', 'OakStride Portal <portal@oakstride.se>',
        'to', jsonb_build_array(to_addr),
        'subject', subj,
        'html', html
      ),
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || api_key)
    );
  exception when others then null;
  end;
end;
$$;

-- 1) Utkast skickat (onboarding_content step 5 med länk)
create or replace function public.notify_draft_sent()
returns trigger language plpgsql security definer set search_path = public as $$
declare cust record;
begin
  if new.step_no <> 5 or new.link is null then return new; end if;
  if tg_op = 'UPDATE' and new.link is not distinct from old.link then return new; end if;
  select email, full_name into cust from public.profiles where id = new.user_id;
  perform public.oak_send_email(
    cust.email,
    'Ditt utkast är redo att granska',
    '<h2>Ditt utkast är redo!</h2>'
      || '<p>Hej ' || public.esc_html(coalesce(cust.full_name,'')) || ',</p>'
      || '<p>Vi har byggt ett utkast av din sida. Logga in i portalen för att granska den och skicka eventuella ändringsönskemål.</p>'
      || '<p><strong>Utkast:</strong> <a href="' || public.esc_html(new.link) || '">' || public.esc_html(new.link) || '</a></p>'
      || '<p><a href="https://portal.oakstride.se">Öppna portalen</a></p>'
  );
  return new;
end;
$$;
drop trigger if exists notify_draft_sent on public.onboarding_content;
create trigger notify_draft_sent after insert or update on public.onboarding_content
  for each row execute function public.notify_draft_sent();

-- 2) Nytt ändringsförslag (tvåvägs)
create or replace function public.notify_proposal()
returns trigger language plpgsql security definer set search_path = public as $$
declare cust record;
begin
  select email, full_name into cust from public.profiles where id = new.user_id;
  if new.author_role = 'admin' then
    perform public.oak_send_email(
      cust.email,
      'OakStride har ett förslag på din sida',
      '<h2>Nytt förslag på din sida</h2>'
        || '<p style="white-space:pre-wrap">' || public.esc_html(new.body) || '</p>'
        || '<p><a href="https://portal.oakstride.se">Öppna portalen för att svara</a></p>'
    );
  else
    perform public.oak_send_email(
      'info@oakstride.se',
      'Ändringsförslag från ' || coalesce(cust.full_name, cust.email),
      '<h2>Ändringsförslag från kund</h2>'
        || '<p><strong>' || public.esc_html(coalesce(cust.full_name, cust.email)) || '</strong></p>'
        || '<p style="white-space:pre-wrap">' || public.esc_html(new.body) || '</p>'
        || '<p><a href="https://portal.oakstride.se">Öppna portalen</a></p>'
    );
  end if;
  return new;
end;
$$;
drop trigger if exists notify_proposal on public.site_change_proposals;
create trigger notify_proposal after insert on public.site_change_proposals
  for each row execute function public.notify_proposal();

-- 3) Lansering (profiles.launched_at null -> not null)
create or replace function public.notify_launched()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.launched_at is not null and old.launched_at is null then
    perform public.oak_send_email(
      new.email,
      'Din sida är live! 🎉',
      '<h2>Grattis — din sida är lanserad!</h2>'
        || '<p>Hej ' || public.esc_html(coalesce(new.full_name,'')) || ',</p>'
        || '<p>Din nya sida är nu live. Tack för ett gott samarbete!</p>'
        || coalesce('<p><a href="' || public.esc_html(new.launch_url) || '">Öppna din sida</a></p>', '')
        || '<p><a href="https://portal.oakstride.se">Öppna portalen</a></p>'
    );
  end if;
  return new;
end;
$$;
drop trigger if exists notify_launched on public.profiles;
create trigger notify_launched after update on public.profiles
  for each row execute function public.notify_launched();
