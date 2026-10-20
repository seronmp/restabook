alter table public.restaurants
  add column if not exists table_management_enabled boolean not null default true,
  add column if not exists whatsapp_quick_replies jsonb not null default '["Deine Pizza ist in 10 Minuten abholbereit.", "Deine Pizza ist jetzt abholbereit."]'::jsonb;

alter table public.whatsapp_booking_sessions
  drop constraint if exists whatsapp_booking_sessions_stage_check;

alter table public.whatsapp_booking_sessions
  add constraint whatsapp_booking_sessions_stage_check
  check (stage in (
    'idle',
    'main_menu',
    'party_size',
    'date',
    'time',
    'customer_name',
    'cancellation_select',
    'cancellation_confirm',
    'ordering',
    'order_name'
  ));