alter table public.whatsapp_booking_sessions
  add column if not exists whatsapp_order_text text;

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
    'ordering'
  ));