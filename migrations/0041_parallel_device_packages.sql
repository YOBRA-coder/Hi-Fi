-- Parallel mode: a package bought from a DIFFERENT device than the one already running starts
-- immediately on its own hotspot login (u<phone>d2, d3 ...) instead of queueing behind it.
alter table settings add column if not exists parallel_device_packages boolean not null default true;
-- Which browser/device paid, so the callback (which has no device) can still start the right login.
alter table payments add column if not exists device_token text;
-- Which package a share code opens (the owner may have several running at once).
alter table device_share_codes add column if not exists customer_package_id text;
