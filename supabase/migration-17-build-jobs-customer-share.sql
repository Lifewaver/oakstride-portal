-- ALT 2: koppla byggjobb till kund + dela-utkast
alter table public.build_jobs add column if not exists customer_id uuid references public.profiles(id);
alter table public.build_jobs add column if not exists shared_at timestamptz;
create index if not exists build_jobs_customer_idx on public.build_jobs (customer_id);

-- Kunden får läsa sitt EGET delade jobb (previews-länken i kundvyn)
drop policy if exists "build_jobs: kund läser eget delat" on public.build_jobs;
create policy "build_jobs: kund läser eget delat" on public.build_jobs
  for select using (customer_id = auth.uid() and shared_at is not null);
