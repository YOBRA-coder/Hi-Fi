-- Public IP addresses that router login traffic arrives from (the hotspot's internet address).
-- A request to the app from one of these means "this phone is on the hotspot Wi-Fi", which lets
-- the installed app link the phone to the router by itself instead of asking the customer.
create table if not exists site_public_ips (
  ip text primary key,
  seen_at timestamptz not null default now()
);
