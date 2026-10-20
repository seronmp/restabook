alter table public.whatsapp_messages
  add column if not exists customer_name text;

alter table public.whatsapp_orders
  add column if not exists customer_name text,
  add column if not exists ready_at timestamptz,
  add column if not exists picked_up_at timestamptz;

grant update (picked_up_at) on public.whatsapp_orders to authenticated;

drop policy if exists "Restaurant members can mark WhatsApp orders picked up" on public.whatsapp_orders;
create policy "Restaurant members can mark WhatsApp orders picked up"
  on public.whatsapp_orders
  for update
  to authenticated
  using (
    auth.jwt() ->> 'email' = 'admin@admin.com'
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()::text
        and p.restaurant_id::text = whatsapp_orders.restaurant_id
    )
  )
  with check (
    auth.jwt() ->> 'email' = 'admin@admin.com'
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()::text
        and p.restaurant_id::text = whatsapp_orders.restaurant_id
    )
  );

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'whatsapp_orders'
    ) then
    alter publication supabase_realtime add table public.whatsapp_orders;
  end if;
end;
$$;