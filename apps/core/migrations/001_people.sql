create schema if not exists core;

create table if not exists core.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references platform.users (id) on delete cascade,
  handle text not null,
  first_name text,
  middle_name text,
  last_name text,
  email text,
  phone text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, handle)
);

create index if not exists people_user_handle_idx on core.people (user_id, handle);
create index if not exists people_search_trgm_idx on core.people
  using gin (
    (
      coalesce(handle, '') || ' ' ||
      coalesce(first_name, '') || ' ' ||
      coalesce(middle_name, '') || ' ' ||
      coalesce(last_name, '') || ' ' ||
      coalesce(email, '') || ' ' ||
      coalesce(phone, '') || ' ' ||
      coalesce(notes, '')
    ) gin_trgm_ops
  );

alter table core.people enable row level security;
alter table core.people force row level security;

drop policy if exists own_rows on core.people;
create policy own_rows on core.people
  using (user_id = nullif(current_setting('app.user_id', true), '')::uuid)
  with check (user_id = nullif(current_setting('app.user_id', true), '')::uuid);
