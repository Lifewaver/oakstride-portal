-- Migration 3: Besöksstatistik för kundernas hemsidor
-- Sajterna postar sidvisningar anonymt; kunden ser aggregat för sin egen sajt i portalen.

create or replace function public.norm_host(t text)
returns text language sql immutable as $$
  select regexp_replace(regexp_replace(lower(coalesce(t, '')), '^https?://', ''), '^www\.|/.*$', '', 'g')
$$;

create table public.page_views (
  id bigint generated always as identity primary key,
  site text not null,
  path text not null default '/',
  referrer text,
  created_at timestamptz not null default now()
);
create index page_views_site_time on public.page_views (site, created_at);

alter table public.page_views enable row level security;

-- Vem som helst får registrera en sidvisning (ingen får läsa rådata)
create policy "page_views: öppen insert" on public.page_views
  for insert to anon, authenticated
  with check (
    char_length(site) between 3 and 100
    and char_length(path) between 1 and 300
    and (referrer is null or char_length(referrer) <= 300)
  );

create or replace function public.normalize_page_view()
returns trigger language plpgsql as $$
begin
  new.site := public.norm_host(new.site);
  if new.referrer is not null and public.norm_host(new.referrer) = new.site then
    new.referrer := null; -- interna klick är inte referrals
  end if;
  return new;
end $$;

create trigger page_views_normalize before insert on public.page_views
  for each row execute function public.normalize_page_view();

-- Aggregerad statistik — bara för sajtens ägare eller admin
create or replace function public.site_stats(p_site text)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare
  host text := public.norm_host(p_site);
  ok boolean;
begin
  select exists(
    select 1 from public.profiles
    where id = auth.uid() and (is_admin or public.norm_host(website) = host)
  ) into ok;
  if not ok then
    return null;
  end if;
  return jsonb_build_object(
    'total_7',  (select count(*) from public.page_views where site = host and created_at > now() - interval '7 days'),
    'total_30', (select count(*) from public.page_views where site = host and created_at > now() - interval '30 days'),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('d', to_char(d, 'YYYY-MM-DD'), 'c', c) order by d), '[]'::jsonb)
      from (
        select gs::date d, count(pv.id) c
        from generate_series(now() - interval '13 days', now(), interval '1 day') gs
        left join public.page_views pv
          on pv.site = host and pv.created_at::date = gs::date
        group by 1
      ) t
    ),
    'top_pages', (
      select coalesce(jsonb_agg(jsonb_build_object('path', path, 'c', c) order by c desc), '[]'::jsonb)
      from (
        select path, count(*) c from public.page_views
        where site = host and created_at > now() - interval '30 days'
        group by path order by count(*) desc limit 5
      ) t
    )
  );
end $$;

-- Koppla Fredriks profil till oakstride.se så statistiken syns för honom
update public.profiles set website = 'oakstride.se'
  where email = 'fredrik@oakstride.se' and website is null;
