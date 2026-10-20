alter table public.bookings
  add column if not exists status text not null default 'confirmed';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.bookings'::regclass
      and conname = 'bookings_status_check'
  ) then
    alter table public.bookings
      add constraint bookings_status_check
      check (status in ('confirmed', 'cancelled'));
  end if;
end;
$$;

create index if not exists bookings_active_table_schedule_idx
  on public.bookings (table_id, date, start_time, end_time)
  where status = 'confirmed';

create or replace function public.prevent_overlapping_table_bookings()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'cancelled' then
    return new;
  end if;

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
      and b.status = 'confirmed'
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
        and b.status = 'confirmed'
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
