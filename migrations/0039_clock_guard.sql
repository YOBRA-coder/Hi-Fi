-- Clock guard: remembers the last wall-clock reading together with the machine's
-- steady (boot-based) uptime, so the app can tell when the VPS clock was STEPPED
-- (NTP/chrony correcting a drifted clock) and shift running packages by the same
-- amount instead of silently shortening or lengthening what customers paid for.
create table if not exists clock_heartbeat (
  id text primary key,
  wall_ms bigint not null,
  uptime_ms bigint,
  boot_id text,
  updated_at timestamptz not null default now()
);
