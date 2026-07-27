-- Publik bucket för kundens uppladdade bilder (foton/logga).
insert into storage.buckets (id, name, public)
values ('customer-uploads', 'customer-uploads', true)
on conflict (id) do nothing;

-- Kund hanterar filer i SIN egen mapp (prefix = user id); admin får allt.
drop policy if exists "customer-uploads insert own" on storage.objects;
create policy "customer-uploads insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'customer-uploads'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "customer-uploads select own" on storage.objects;
create policy "customer-uploads select own" on storage.objects for select to authenticated
  using (bucket_id = 'customer-uploads'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "customer-uploads delete own" on storage.objects;
create policy "customer-uploads delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'customer-uploads'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));
