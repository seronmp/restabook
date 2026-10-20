alter table public.whatsapp_booking_sessions
  add column if not exists customer_name text,
  add column if not exists language text not null default 'it'
    check (language in ('en', 'it', 'de'));
