-- Local-only stand-in for the dashboard tables that the repo's migrations expect to exist.
create table if not exists public.restaurants (
  restaurant_id text primary key,
  name text not null
);

create table if not exists public.profiles (
  id text primary key,
  restaurant_id text
);

create table if not exists public.tables (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null,
  table_number integer not null,
  seats integer not null,
  pos_x numeric default 0,
  pos_y numeric default 0,
  width numeric default 80,
  height numeric default 80,
  rotation numeric default 0
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null,
  table_id uuid references public.tables(id) on delete cascade,
  date date not null,
  start_time time without time zone not null,
  end_time time without time zone not null,
  name text,
  guests integer,
  phone text
);

grant all on public.restaurants, public.profiles, public.tables, public.bookings to service_role;
