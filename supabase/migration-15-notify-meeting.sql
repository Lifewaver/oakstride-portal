-- migration-15: e-postavisering när uppstartsmötesdatum sätts/ändras. Applicerad 2026-07-22.
create or replace function public.notify_meeting()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.meeting_at is not null and new.meeting_at is distinct from old.meeting_at then
    perform public.oak_send_email(
      new.email,
      'Ert uppstartsmöte är bokat',
      '<h2>Uppstartsmöte bokat</h2>'
        || '<p>Hej ' || public.esc_html(coalesce(new.full_name,'')) || ',</p>'
        || '<p>Vi har bokat in ert uppstartsmöte till <strong>' || to_char(new.meeting_at,'YYYY-MM-DD') || '</strong>. Du ser det även i din portal.</p>'
        || '<p><a href="https://portal.oakstride.se">Öppna portalen</a></p>'
    );
  end if;
  return new;
end;
$$;
drop trigger if exists notify_meeting on public.profiles;
create trigger notify_meeting after update on public.profiles
  for each row execute function public.notify_meeting();
