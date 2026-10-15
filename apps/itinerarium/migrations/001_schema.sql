create schema if not exists itinerarium;

create table if not exists itinerarium.trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references platform.users (id) on delete cascade,
  name text not null,
  start_date date,
  end_date date,
  timezone text not null default 'UTC',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trips_user_id_idx on itinerarium.trips (user_id);

create table if not exists itinerarium.events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references itinerarium.trips (id) on delete cascade,
  user_id uuid not null references platform.users (id) on delete cascade,
  title text not null,
  place_name text,
  place_url text,
  start_at timestamptz,
  end_at timestamptz,
  duration_minutes int,
  notes text,
  position int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_end_after_start check (
    end_at is null or start_at is null or end_at >= start_at
  ),
  constraint events_duration_needs_start check (
    duration_minutes is null or start_at is not null
  ),
  constraint events_end_needs_start check (
    end_at is null or start_at is not null
  )
);

create index if not exists events_trip_position_idx
  on itinerarium.events (trip_id, position, id);

create table if not exists itinerarium.documents (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references itinerarium.events (id) on delete cascade,
  user_id uuid not null references platform.users (id) on delete cascade,
  file_name text not null,
  mime_type text not null,
  byte_size int not null,
  storage text not null check (storage in ('local', 'drive')),
  local_key text,
  drive_file_id text,
  drive_web_view_link text,
  created_at timestamptz not null default now()
);

create index if not exists documents_event_id_idx on itinerarium.documents (event_id);

create table if not exists itinerarium.share_links (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references itinerarium.trips (id) on delete cascade,
  user_id uuid not null references platform.users (id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists share_links_trip_id_idx on itinerarium.share_links (trip_id);
create unique index if not exists share_links_active_trip_idx
  on itinerarium.share_links (trip_id)
  where revoked_at is null;

create table if not exists itinerarium.settings (
  user_id uuid primary key references platform.users (id) on delete cascade,
  drive_service_account_enc text,
  updated_at timestamptz not null default now()
);

-- RLS helpers: own rows, or public read via app.share_token
create or replace function itinerarium.is_owner(row_user_id uuid)
returns boolean
language sql
stable
as $$
  select row_user_id = nullif(current_setting('app.user_id', true), '')::uuid
$$;

create or replace function itinerarium.share_token_matches(trip uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from itinerarium.share_links s
    where s.trip_id = trip
      and s.revoked_at is null
      and s.token = nullif(current_setting('app.share_token', true), '')
  )
$$;

alter table itinerarium.trips enable row level security;
alter table itinerarium.trips force row level security;
drop policy if exists trips_select on itinerarium.trips;
create policy trips_select on itinerarium.trips for select
  using (itinerarium.is_owner(user_id) or itinerarium.share_token_matches(id));
drop policy if exists trips_write on itinerarium.trips;
create policy trips_write on itinerarium.trips for all
  using (itinerarium.is_owner(user_id))
  with check (itinerarium.is_owner(user_id));

alter table itinerarium.events enable row level security;
alter table itinerarium.events force row level security;
drop policy if exists events_select on itinerarium.events;
create policy events_select on itinerarium.events for select
  using (itinerarium.is_owner(user_id) or itinerarium.share_token_matches(trip_id));
drop policy if exists events_write on itinerarium.events;
create policy events_write on itinerarium.events for all
  using (itinerarium.is_owner(user_id))
  with check (itinerarium.is_owner(user_id));

alter table itinerarium.documents enable row level security;
alter table itinerarium.documents force row level security;
drop policy if exists documents_select on itinerarium.documents;
create policy documents_select on itinerarium.documents for select
  using (
    itinerarium.is_owner(user_id)
    or exists (
      select 1 from itinerarium.events e
      where e.id = event_id
        and itinerarium.share_token_matches(e.trip_id)
    )
  );
drop policy if exists documents_write on itinerarium.documents;
create policy documents_write on itinerarium.documents for all
  using (itinerarium.is_owner(user_id))
  with check (itinerarium.is_owner(user_id));

alter table itinerarium.share_links enable row level security;
alter table itinerarium.share_links force row level security;
drop policy if exists share_links_select on itinerarium.share_links;
create policy share_links_select on itinerarium.share_links for select
  using (
    itinerarium.is_owner(user_id)
    or (
      revoked_at is null
      and token = nullif(current_setting('app.share_token', true), '')
    )
  );
drop policy if exists share_links_write on itinerarium.share_links;
create policy share_links_write on itinerarium.share_links for all
  using (itinerarium.is_owner(user_id))
  with check (itinerarium.is_owner(user_id));

alter table itinerarium.settings enable row level security;
alter table itinerarium.settings force row level security;
drop policy if exists settings_own on itinerarium.settings;
create policy settings_own on itinerarium.settings
  using (itinerarium.is_owner(user_id))
  with check (itinerarium.is_owner(user_id));
