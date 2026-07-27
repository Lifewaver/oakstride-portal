-- Grundmallar (styr "Bygg sajt"-formulärets Grundmall-dropdown + mall-specifika fält).
-- Lägg till en ny mall = ny rad här + en modul i oakstride-studio-kit/generator/templates/.
create table if not exists public.site_templates (
  key         text primary key,
  label       text not null,
  description text,
  extra_fields jsonb not null default '[]'::jsonb,
  sort        int not null default 100,
  active      boolean not null default true
);
alter table public.site_templates enable row level security;
drop policy if exists "site_templates: läs" on public.site_templates;
create policy "site_templates: läs" on public.site_templates for select to authenticated using (true);
drop policy if exists "site_templates: admin skriver" on public.site_templates;
create policy "site_templates: admin skriver" on public.site_templates for all using (public.is_admin()) with check (public.is_admin());

insert into public.site_templates (key, label, description, sort, extra_fields) values
  ('generisk', 'Generisk', 'Standardlayout för alla segment.', 10, '[]'::jsonb),
  ('restaurang', 'Restaurang (meny + bordsbokning)', 'Meny-utdrag, bordsbokning, öppettider.', 20,
    '[{"key":"menu","label":"Meny (en rad per rätt: Rätt | pris | beskrivning)","type":"lines","hint":"Ex: Rökt röding | 165 kr | Pepparrotscrème och dill"}]'::jsonb),
  ('frisor', 'Frisör/Skönhet (prislista + boka tid)', 'Prislista och boka tid-flöde.', 30,
    '[{"key":"priceList","label":"Prislista (en rad per tjänst: Tjänst | pris | ev. notering)","type":"lines","hint":"Ex: Klippning dam | från 595 kr | inkl. tvätt & föning"}]'::jsonb)
on conflict (key) do update set label=excluded.label, description=excluded.description, sort=excluded.sort, extra_fields=excluded.extra_fields;
