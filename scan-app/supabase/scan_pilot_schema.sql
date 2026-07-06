-- SCAN pilot schema for CCI Azerbaijan.
-- Paste this into the Supabase SQL editor and run it once.
-- It is intentionally additive so existing prototype data is not dropped.

begin;

create extension if not exists pgcrypto;

create table if not exists public.stores (
  id uuid primary key default gen_random_uuid(),
  store_code text unique,
  store_name text,
  district text,
  owner_name text,
  phone text,
  pin_hash text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  last_seen timestamptz
);

alter table public.stores
  add column if not exists name text,
  add column if not exists store_code text,
  add column if not exists store_name text,
  add column if not exists district text,
  add column if not exists owner_name text,
  add column if not exists phone text,
  add column if not exists pin_hash text,
  add column if not exists is_active boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists last_seen timestamptz;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stores'
      and column_name = 'name'
  ) then
    update public.stores
    set store_name = coalesce(store_name, name)
    where store_name is null;
  end if;
end $$;

update public.stores
set
  store_code = coalesce(
    store_code,
    upper(left(coalesce(district, 'GEN'), 3)) || '-' || lpad(row_number_text.seq, 3, '0')
  ),
  store_name = coalesce(store_name, 'Store #' || row_number_text.seq),
  name = coalesce(name, store_name, 'Store #' || row_number_text.seq),
  district = coalesce(district, 'Unassigned')
from (
  select id, row_number() over (order by created_at, id)::text as seq
  from public.stores
) as row_number_text
where public.stores.id = row_number_text.id
  and (
    public.stores.store_code is null
    or public.stores.store_name is null
    or public.stores.name is null
    or public.stores.district is null
  );

alter table public.stores
  alter column store_code set not null,
  alter column store_name set not null,
  alter column district set not null;

create unique index if not exists stores_store_code_key
  on public.stores (store_code);

create or replace function public.set_store_identity_fields()
returns trigger
language plpgsql
as $$
declare
  district_prefix text;
  store_number text;
begin
  new.store_name := coalesce(new.store_name, new.name, 'Store');
  new.name := coalesce(new.name, new.store_name);
  new.district := coalesce(new.district, 'Unassigned');

  district_prefix := upper(left(regexp_replace(new.district, '[^A-Za-z]', '', 'g'), 3));
  if district_prefix = '' then
    district_prefix := 'GEN';
  end if;

  store_number := substring(coalesce(new.store_name, new.name) from '#([0-9]+)');
  if store_number is null then
    store_number := substring(coalesce(new.store_code, '') from '-([0-9]+)$');
  end if;
  if store_number is null then
    store_number := lpad((abs(hashtext(coalesce(new.name, new.store_name))) % 1000)::text, 3, '0');
  end if;

  new.store_code := coalesce(new.store_code, district_prefix || '-' || lpad(store_number, 3, '0'));
  return new;
end;
$$;

drop trigger if exists stores_set_identity_fields on public.stores;
create trigger stores_set_identity_fields
before insert or update of name, store_code, store_name, district
on public.stores
for each row
execute function public.set_store_identity_fields();

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  barcode text unique,
  name text,
  brand text,
  category text,
  is_cci_product boolean not null default false,
  image_url text,
  source text not null default 'local',
  created_at timestamptz not null default now(),
  constraint products_source_check
    check (source in ('openfoodfacts', 'local', 'manual'))
);

alter table public.products
  add column if not exists barcode text,
  add column if not exists name text,
  add column if not exists brand text,
  add column if not exists category text,
  add column if not exists is_cci_product boolean not null default false,
  add column if not exists image_url text,
  add column if not exists source text not null default 'local',
  add column if not exists created_at timestamptz not null default now();

create unique index if not exists products_barcode_key
  on public.products (barcode)
  where barcode is not null;

create table if not exists public.baskets (
  id uuid primary key default gen_random_uuid(),
  store_id uuid references public.stores(id) on delete cascade,
  scanned_at timestamptz not null default now(),
  day_of_week text,
  hour_of_day integer,
  item_count integer not null default 0,
  is_flagged boolean not null default false,
  flag_reason text,
  synced_from_offline boolean not null default false
);

alter table public.baskets
  add column if not exists store_id uuid,
  add column if not exists district text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists scanned_at timestamptz not null default now(),
  add column if not exists day_of_week text,
  add column if not exists hour_of_day integer,
  add column if not exists item_count integer not null default 0,
  add column if not exists total_items integer not null default 0,
  add column if not exists contains_cci boolean not null default false,
  add column if not exists quality_score integer,
  add column if not exists points_awarded integer,
  add column if not exists is_flagged boolean not null default false,
  add column if not exists flag_reason text,
  add column if not exists synced_from_offline boolean not null default false;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'baskets'
      and column_name = 'created_at'
  ) then
    update public.baskets
    set scanned_at = coalesce(scanned_at, created_at)
    where scanned_at is null;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'baskets'
      and column_name = 'total_items'
  ) then
    update public.baskets
    set item_count = coalesce(nullif(item_count, 0), total_items, 0);
  end if;
end $$;

update public.baskets
set
  created_at = coalesce(created_at, scanned_at),
  day_of_week = coalesce(day_of_week, trim(to_char(scanned_at at time zone 'Asia/Baku', 'Day'))),
  hour_of_day = coalesce(hour_of_day, extract(hour from scanned_at at time zone 'Asia/Baku')::integer),
  total_items = coalesce(nullif(total_items, 0), item_count, 0);

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'baskets'
      and constraint_name = 'baskets_store_id_fkey'
  ) then
    alter table public.baskets
      add constraint baskets_store_id_fkey
      foreign key (store_id) references public.stores(id) on delete cascade
      not valid;
  end if;
end $$;

create index if not exists baskets_store_scanned_at_idx
  on public.baskets (store_id, scanned_at desc);

create index if not exists baskets_scanned_at_idx
  on public.baskets (scanned_at desc);

create table if not exists public.basket_items (
  id uuid primary key default gen_random_uuid(),
  basket_id uuid references public.baskets(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  quantity integer not null default 1
);

alter table public.basket_items
  add column if not exists basket_id uuid,
  add column if not exists product_id uuid,
  add column if not exists product_name text,
  add column if not exists category text,
  add column if not exists is_cci_product boolean not null default false,
  add column if not exists quantity integer not null default 1;

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'basket_items'
      and constraint_name = 'basket_items_basket_id_fkey'
  ) then
    alter table public.basket_items
      add constraint basket_items_basket_id_fkey
      foreign key (basket_id) references public.baskets(id) on delete cascade
      not valid;
  end if;

  if not exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and table_name = 'basket_items'
      and constraint_name = 'basket_items_product_id_fkey'
  ) then
    alter table public.basket_items
      add constraint basket_items_product_id_fkey
      foreign key (product_id) references public.products(id) on delete set null
      not valid;
  end if;
end $$;

create index if not exists basket_items_basket_id_idx
  on public.basket_items (basket_id);

create index if not exists basket_items_product_id_idx
  on public.basket_items (product_id);

create table if not exists public.store_daily_stats (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  date date not null,
  basket_count integer not null default 0,
  streak_day boolean not null default false,
  total_items_scanned integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, date)
);

create index if not exists store_daily_stats_store_date_idx
  on public.store_daily_stats (store_id, date desc);

create table if not exists public.fraud_flags (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.stores(id) on delete cascade,
  detected_at timestamptz not null default now(),
  flag_type text not null,
  basket_id uuid references public.baskets(id) on delete set null,
  resolved boolean not null default false,
  constraint fraud_flags_flag_type_check
    check (flag_type in ('too_fast', 'no_variety', 'odd_hours', 'daily_cap_exceeded'))
);

create index if not exists fraud_flags_store_detected_at_idx
  on public.fraud_flags (store_id, detected_at desc);

create or replace function public.set_basket_time_fields()
returns trigger
language plpgsql
as $$
begin
  new.scanned_at := coalesce(new.scanned_at, now());
  new.created_at := coalesce(new.created_at, new.scanned_at);
  new.item_count := coalesce(nullif(new.item_count, 0), new.total_items, 0);
  new.total_items := coalesce(nullif(new.total_items, 0), new.item_count, 0);
  new.day_of_week := coalesce(
    new.day_of_week,
    trim(to_char(new.scanned_at at time zone 'Asia/Baku', 'Day'))
  );
  new.hour_of_day := coalesce(
    new.hour_of_day,
    extract(hour from new.scanned_at at time zone 'Asia/Baku')::integer
  );
  return new;
end;
$$;

drop trigger if exists baskets_set_time_fields on public.baskets;
create trigger baskets_set_time_fields
before insert or update of scanned_at, day_of_week, hour_of_day
on public.baskets
for each row
execute function public.set_basket_time_fields();

create or replace function public.bump_store_daily_stats()
returns trigger
language plpgsql
as $$
begin
  insert into public.store_daily_stats (
    store_id,
    date,
    basket_count,
    streak_day,
    total_items_scanned
  )
  values (
    new.store_id,
    (new.scanned_at at time zone 'Asia/Baku')::date,
    1,
    true,
    coalesce(new.item_count, 0)
  )
  on conflict (store_id, date)
  do update set
    basket_count = public.store_daily_stats.basket_count + 1,
    streak_day = true,
    total_items_scanned =
      public.store_daily_stats.total_items_scanned + coalesce(excluded.total_items_scanned, 0),
    updated_at = now();

  update public.stores
  set last_seen = now()
  where id = new.store_id;

  return new;
end;
$$;

drop trigger if exists baskets_bump_store_daily_stats on public.baskets;
create trigger baskets_bump_store_daily_stats
after insert on public.baskets
for each row
execute function public.bump_store_daily_stats();

create or replace function public.login_store(
  p_store_code text,
  p_pin text
)
returns table (
  store_id uuid,
  store_code text,
  store_name text,
  district text,
  owner_name text,
  phone text,
  is_active boolean,
  last_seen timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.stores
  set last_seen = now()
  where upper(public.stores.store_code) = upper(trim(p_store_code))
    and public.stores.pin_hash = encode(digest(p_pin, 'sha256'), 'hex')
    and public.stores.is_active = true
  returning
    public.stores.id,
    public.stores.store_code,
    public.stores.store_name,
    public.stores.district,
    public.stores.owner_name,
    public.stores.phone,
    public.stores.is_active,
    public.stores.last_seen;
end;
$$;

revoke all on function public.login_store(text, text) from public;
grant execute on function public.login_store(text, text) to anon;
grant execute on function public.login_store(text, text) to authenticated;

-- Pilot seed stores. PINs below are examples:
-- NAR-047 -> 0470
-- YAS-014 -> 0140
-- KHA-031 -> 0310
insert into public.stores (
  name,
  store_code,
  store_name,
  district,
  owner_name,
  phone,
  pin_hash,
  is_active
)
values
  ('Store #47 — Narimanov', 'NAR-047', 'Store #47', 'Narimanov', 'Demo Owner', '+994501112233', encode(digest('0470', 'sha256'), 'hex'), true),
  ('Store #14 — Yasamal', 'YAS-014', 'Store #14', 'Yasamal', 'Demo Owner', '+994501112244', encode(digest('0140', 'sha256'), 'hex'), true),
  ('Store #31 — Khatai', 'KHA-031', 'Store #31', 'Khatai', 'Demo Owner', '+994501112255', encode(digest('0310', 'sha256'), 'hex'), true)
on conflict (store_code)
do update set
  name = excluded.name,
  store_name = excluded.store_name,
  district = excluded.district,
  owner_name = coalesce(public.stores.owner_name, excluded.owner_name),
  phone = coalesce(public.stores.phone, excluded.phone),
  pin_hash = coalesce(public.stores.pin_hash, excluded.pin_hash),
  is_active = true;

commit;
