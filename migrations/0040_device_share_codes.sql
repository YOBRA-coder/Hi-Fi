-- One-time codes a package owner creates on their own device so another phone can join the package.
-- Joining by phone number alone let anyone who guessed a number with a running package connect.
create table if not exists device_share_codes (
  id text primary key,
  customer_id text not null references customers(id),
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists device_share_codes_customer_idx on device_share_codes (customer_id, created_at desc);
