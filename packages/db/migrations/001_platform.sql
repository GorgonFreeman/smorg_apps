create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create schema if not exists platform;

create table if not exists platform.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists platform.sessions (
  token_hash text primary key,
  user_id uuid not null references platform.users (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists sessions_user_id_idx on platform.sessions (user_id);
create index if not exists sessions_expires_at_idx on platform.sessions (expires_at);

create table if not exists platform.otp_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists otp_codes_email_idx on platform.otp_codes (email);

create table if not exists platform.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count int not null default 0,
  primary key (key, window_start)
);

create table if not exists platform.apps (
  slug text primary key,
  name text not null,
  color text,
  version text not null
);

create table if not exists platform.installations (
  user_id uuid not null references platform.users (id) on delete cascade,
  app_slug text not null references platform.apps (slug),
  installed_at timestamptz not null default now(),
  app_version text not null,
  primary key (user_id, app_slug)
);

create table if not exists platform.migrations (
  app text not null,
  filename text not null,
  applied_at timestamptz not null default now(),
  primary key (app, filename)
);
