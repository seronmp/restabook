alter table public.restaurants
  add column if not exists whatsapp_ordering_enabled boolean not null default false,
  add column if not exists whatsapp_ordering_menu_url text,
  add column if not exists whatsapp_ordering_phone text;

create table if not exists public.whatsapp_orders (
  message_sid text primary key,
  restaurant_id text not null,
  customer_phone text not null,
  order_text text not null check (length(trim(order_text)) between 1 and 1500),
  status text not null default 'new' check (status in ('new', 'accepted', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_orders_restaurant_created_idx
  on public.whatsapp_orders (restaurant_id, created_at desc);

alter table public.whatsapp_orders enable row level security;
revoke all on public.whatsapp_orders from public, anon;
grant all on public.whatsapp_orders to service_role;
grant select on public.whatsapp_orders to authenticated;

create policy "Restaurant members can read WhatsApp orders"
  on public.whatsapp_orders
  for select
  to authenticated
  using (
    auth.jwt() ->> 'email' = 'admin@admin.com'
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()::text
        and p.restaurant_id::text = whatsapp_orders.restaurant_id
    )
  );