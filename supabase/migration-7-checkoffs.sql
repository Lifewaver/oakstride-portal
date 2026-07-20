-- Migration 7: Kunden bockar av och godkänner varje uppstartssteg
-- Varje avbockat steg loggas oföränderligt. Admin aviseras. Körs efter migration-6.

create table if not exists public.onboarding_checkoffs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  step_no int not null,
  done_at timestamptz not null default now(),
  unique (user_id, step_no)
);
alter table public.onboarding_checkoffs enable row level security;

create policy "checkoffs: läs egna eller admin" on public.onboarding_checkoffs
  for select using (user_id = auth.uid() or public.is_admin());
create policy "checkoffs: kund bockar av eget" on public.onboarding_checkoffs
  for insert with check (user_id = auth.uid());
create policy "checkoffs: admin raderar" on public.onboarding_checkoffs
  for delete using (public.is_admin());
-- ingen update-policy → raderna är oföränderliga (kund kan inte ändra tidsstämpel)

-- Avisera admin när kunden godkänner ett steg.
create or replace function public.notify_checkoff()
returns trigger language plpgsql security definer set search_path = public as $$
declare api_key text; who record;
begin
  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'resend_api_key';
  if api_key is null then return new; end if;
  select email, full_name, company into who from public.profiles where id = new.user_id;
  begin
    perform net.http_post(
      url := 'https://api.resend.com/emails',
      body := jsonb_build_object(
        'from', 'OakStride Portal <portal@oakstride.se>',
        'to', jsonb_build_array('info@oakstride.se'),
        'subject', 'Kund godkände uppstartssteg ' || new.step_no,
        'html', '<h2>Uppstartssteg godkänt</h2><p>'
          || public.esc_html(coalesce(who.full_name, who.email))
          || coalesce(' (' || public.esc_html(who.company) || ')', '')
          || ' godkände steg ' || new.step_no || ' i uppstartsflödet.</p>'
          || '<p><a href="https://portal.oakstride.se">Öppna portalen</a></p>'
      ),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || api_key)
    );
  exception when others then null;
  end;
  return new;
end; $$;

create trigger notify_checkoff_done after insert on public.onboarding_checkoffs
  for each row execute function public.notify_checkoff();
