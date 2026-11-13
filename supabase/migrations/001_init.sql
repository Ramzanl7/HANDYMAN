-- Handyman Grozny: schema for orders, content and admin auth.
-- All tables are private (RLS on, no policies): only the edge function (service role) touches them.

create table if not exists hm_orders (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  num text,
  name text,
  phone text,
  area text,
  when_text text,
  note text,
  items jsonb not null default '[]',
  total_from int,
  status text not null default 'new' check (status in ('new','work','done','cancel')),
  admin_note text not null default '',
  ip_hash text
);
create index if not exists hm_orders_created_idx on hm_orders (created_at desc);
create index if not exists hm_orders_ip_idx on hm_orders (ip_hash, created_at desc);

create table if not exists hm_services (
  id bigint generated always as identity primary key,
  cat text not null,
  cat_title text not null,
  name text not null,
  price_from int check (price_from is null or price_from >= 0),
  sort int not null default 0,
  active boolean not null default true
);

create table if not exists hm_cases (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  tag text not null default '',
  title text not null,
  was text not null default '',
  did text not null default '',
  result text not null default '',
  before_url text,
  after_url text,
  before_cap text not null default 'было',
  after_cap text not null default 'стало ✓',
  sort int not null default 0,
  published boolean not null default true
);

create table if not exists hm_gallery (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  title text not null default '',
  tag text not null default '',
  image_url text not null,
  sort int not null default 0,
  published boolean not null default true
);

create table if not exists hm_texts (
  key text primary key,
  label text not null,
  value text not null default '',
  sort int not null default 0
);

create table if not exists hm_admin (
  id int primary key default 1 check (id = 1),
  chat_id bigint,
  pair_code text,
  pair_expires timestamptz,
  code_hash text,
  code_expires timestamptz,
  code_attempts int not null default 0,
  last_code_at timestamptz
);
insert into hm_admin (id) values (1) on conflict do nothing;

create table if not exists hm_admin_sessions (
  token_hash text primary key,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

alter table hm_orders enable row level security;
alter table hm_services enable row level security;
alter table hm_cases enable row level security;
alter table hm_gallery enable row level security;
alter table hm_texts enable row level security;
alter table hm_admin enable row level security;
alter table hm_admin_sessions enable row level security;

-- public bucket for work photos (read by URL; uploads only via signed URLs from the edge function)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hm-media', 'hm-media', true, 5242880, array['image/webp','image/jpeg','image/png'])
on conflict (id) do nothing;
