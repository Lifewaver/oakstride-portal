-- Mejla kunden (Resend) när ett utkast delas (shared_at sätts).
create or replace function public.notify_draft_shared()
returns trigger language plpgsql security definer set search_path = public as $$
declare api_key text; cust record;
begin
  if new.shared_at is null or old.shared_at is not null then return new; end if; -- endast vid delning
  if new.customer_id is null then return new; end if;
  select email, full_name into cust from public.profiles where id = new.customer_id;
  if cust.email is null then return new; end if;
  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'resend_api_key';
  if api_key is null then return new; end if;
  begin
    perform net.http_post(
      url := 'https://api.resend.com/emails',
      body := jsonb_build_object(
        'from', 'OakStride Studio <portal@oakstride.se>',
        'to', jsonb_build_array(cust.email),
        'subject', 'Ditt webbplatsutkast är klart för granskning',
        'html', '<h2>Ditt webbplatsutkast är klart!</h2>'
          || '<p>Hej ' || coalesce(public.esc_html(split_part(cust.full_name, ' ', 1)), 'där') || '!</p>'
          || '<p>Nu finns ett första utkast av din nya webbplats att titta på. Logga in i portalen så ser du hela sidan.</p>'
          || '<p><a href="https://portal.oakstride.se">Öppna portalen</a></p>'
          || '<p>Vill du ändra något &ndash; text, bilder eller upplägg &ndash; gör du det enkelt direkt i portalen, så tar vår AI-assistent hand om ändringarna.</p>'
          || '<p>Hälsningar,<br>OakStride Studio</p>'
      ),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || api_key)
    );
  exception when others then null;
  end;
  return new;
end; $$;

drop trigger if exists build_jobs_shared_notify on public.build_jobs;
create trigger build_jobs_shared_notify after update on public.build_jobs
  for each row execute function public.notify_draft_shared();
