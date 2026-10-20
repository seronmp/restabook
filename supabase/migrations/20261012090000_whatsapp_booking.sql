create table if not exists public.whatsapp_booking_sessions (
  phone_hash text primary key,
  stage text not null check (stage in ('idle', 'party_size', 'date', 'time', 'customer_name')),
  guests integer,
  booking_date date,
  start_time time without time zone,
  end_time time without time zone,
  last_message_sid text,
  last_reply text
);

alter table public.whatsapp_booking_sessions enable row level security;
revoke all on public.whatsapp_booking_sessions from public, anon, authenticated;
grant all on public.whatsapp_booking_sessions to service_role;

create table if not exists public.whatsapp_booking_requests (
  message_sid text primary key,
  result jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.whatsapp_booking_requests enable row level security;
revoke all on public.whatsapp_booking_requests from public, anon, authenticated;
grant all on public.whatsapp_booking_requests to service_role;

create index if not exists bookings_whatsapp_availability_idx
  on public.bookings (restaurant_id, date, start_time, end_time);

create index if not exists tables_whatsapp_capacity_idx
  on public.tables (restaurant_id, seats);

create or replace function public.prevent_overlapping_table_bookings()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.start_time >= new.end_time then
    raise exception 'Booking end time must be after start time'
      using errcode = '23514';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(new.restaurant_id::text),
    hashtext(new.date::text)
  );

  if exists (
    select 1
    from public.bookings b
    where b.restaurant_id = new.restaurant_id
      and b.table_id = new.table_id
      and b.date = new.date
      and b.start_time < new.end_time
      and b.end_time > new.start_time
      and b.id is distinct from new.id
  ) then
    raise exception 'This table is already booked for the selected time'
      using errcode = '23P01';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_overlapping_table_bookings on public.bookings;
create trigger prevent_overlapping_table_bookings
before insert or update
on public.bookings
for each row execute function public.prevent_overlapping_table_bookings();

create or replace function public.create_whatsapp_booking(
  p_restaurant_id text,
  p_guests integer,
  p_booking_date date,
  p_start_time time without time zone,
  p_end_time time without time zone,
  p_customer_name text,
  p_phone text,
  p_message_sid text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_table_id public.tables.id%type;
  v_table_number public.tables.table_number%type;
  v_restaurant_id public.tables.restaurant_id%type;
  v_result jsonb;
begin
  if p_restaurant_id is null or p_guests is null or p_guests < 1
    or p_booking_date is null or p_start_time is null or p_end_time is null
    or p_start_time >= p_end_time
    or p_customer_name is null or length(trim(p_customer_name)) = 0
    or p_message_sid is null or length(p_message_sid) = 0 then
    raise exception 'Invalid WhatsApp booking details'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtext(p_restaurant_id),
    hashtext(p_booking_date::text)
  );

  select r.result
  into v_result
  from public.whatsapp_booking_requests r
  where r.message_sid = p_message_sid;

  if found then
    return v_result;
  end if;

  select t.id, t.table_number, t.restaurant_id
  into v_table_id, v_table_number, v_restaurant_id
  from public.tables t
  where t.restaurant_id::text = p_restaurant_id
    and t.seats >= p_guests
    and not exists (
      select 1
      from public.bookings b
      where b.table_id = t.id
        and b.restaurant_id::text = p_restaurant_id
        and b.date = p_booking_date
        and b.start_time < p_end_time
        and b.end_time > p_start_time
    )
  order by t.seats asc, t.table_number::text asc
  limit 1;

  if v_table_id is null then
    v_result := jsonb_build_object('available', false);
    insert into public.whatsapp_booking_requests (message_sid, result)
    values (p_message_sid, v_result);
    return v_result;
  end if;

  insert into public.bookings (
    table_id,
    date,
    start_time,
    end_time,
    name,
    guests,
    phone,
    restaurant_id
  ) values (
    v_table_id,
    p_booking_date,
    p_start_time,
    p_end_time,
    trim(p_customer_name),
    p_guests,
    p_phone,
    v_restaurant_id
  );

  v_result := jsonb_build_object(
    'available', true,
    'table_number', v_table_number::text
  );
  insert into public.whatsapp_booking_requests (message_sid, result)
  values (p_message_sid, v_result);

  return v_result;
end;
$$;

revoke all on function public.prevent_overlapping_table_bookings() from public, anon, authenticated;
revoke all on function public.create_whatsapp_booking(text, integer, date, time without time zone, time without time zone, text, text, text)
  from public, anon, authenticated;
grant execute on function public.create_whatsapp_booking(text, integer, date, time without time zone, time without time zone, text, text, text)
  to service_role;
