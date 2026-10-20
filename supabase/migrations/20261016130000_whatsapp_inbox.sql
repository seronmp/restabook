create table if not exists public.whatsapp_messages (
  id bigint generated always as identity primary key,
  restaurant_id text not null,
  customer_phone text not null,
  direction text not null check (direction in ('in', 'out')),
  sender text not null check (sender in ('customer', 'bot', 'staff')),
  body text not null check (length(body) between 1 and 4000),
  message_sid text unique,
  sent_by text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_messages_conversation_idx
  on public.whatsapp_messages (restaurant_id, customer_phone, created_at desc);

alter table public.whatsapp_messages enable row level security;
revoke all on public.whatsapp_messages from public, anon;
grant all on public.whatsapp_messages to service_role;
grant select on public.whatsapp_messages to authenticated;
grant update (read_at) on public.whatsapp_messages to authenticated;

drop policy if exists "Restaurant members can read WhatsApp messages" on public.whatsapp_messages;
create policy "Restaurant members can read WhatsApp messages"
  on public.whatsapp_messages
  for select
  to authenticated
  using (
    auth.jwt() ->> 'email' = 'admin@admin.com'
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()::text
        and p.restaurant_id::text = whatsapp_messages.restaurant_id
    )
  );

drop policy if exists "Restaurant members can mark WhatsApp messages read" on public.whatsapp_messages;
create policy "Restaurant members can mark WhatsApp messages read"
  on public.whatsapp_messages
  for update
  to authenticated
  using (
    auth.jwt() ->> 'email' = 'admin@admin.com'
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()::text
        and p.restaurant_id::text = whatsapp_messages.restaurant_id
    )
  )
  with check (
    auth.jwt() ->> 'email' = 'admin@admin.com'
    or exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()::text
        and p.restaurant_id::text = whatsapp_messages.restaurant_id
    )
  );

alter table public.whatsapp_booking_sessions
  add column if not exists human_until timestamptz;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'whatsapp_messages'
    ) then
    alter publication supabase_realtime add table public.whatsapp_messages;
  end if;
end;
$$;
