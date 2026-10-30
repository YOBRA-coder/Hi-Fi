/**
 * Clock guard.
 *
 * Every package start/expiry, outage credit and payment timestamp comes from the
 * VPS clock. A VPS clock that is wrong, or that gets corrected by NTP in one big
 * step, would otherwise make packages expire early (clock jumps forward) or run
 * long (jumps back), and M-Pesa timestamps drift.
 *
 *  1. detectClockStep(): compares how far the wall clock moved with how far the
 *     machine's steady clock moved. Any difference is a clock STEP. Running
 *     packages are shifted by that step so customers keep exactly the time they
 *     paid for, whichever way the clock was corrected.
 *  2. measureClockSkew(): asks trusted HTTPS servers for the real time (Date
 *     header) so the admin is warned when the VPS clock is wrong, and so M-Pesa
 *     timestamps use real time even before the host is fixed.
 */
import { readFile } from "node:fs/promises";
import { getSql } from "@/lib/db";
import { computeClockStep } from "./clock-math";
import { logEvent } from "./settings.server";

export const APP_TZ = process.env.APP_TIMEZONE || "Africa/Nairobi";
/** Ignore jitter: NTP slewing moves the clock by milliseconds, never seconds. */
export const STEP_THRESHOLD_MS = 5_000;
const HEARTBEAT_ID = "main";

/** Human time in the business time zone, e.g. "31 Oct 2026, 00:56:27". */
export function fmtLocal(d: Date | number | string): string {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TZ,
    hourCycle: "h23",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function fmtDuration(ms: number): string {
  const abs = Math.abs(ms);
  const s = Math.round(abs / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/** Boot-time based uptime (keeps counting through suspend, unaffected by clock steps). */
async function readSteadyMs(): Promise<number | null> {
  try {
    const txt = await readFile("/proc/uptime", "utf8");
    const secs = Number.parseFloat(txt.split(" ")[0]);
    return Number.isFinite(secs) ? Math.round(secs * 1000) : null;
  } catch {
    return null;
  }
}

async function readBootId(): Promise<string | null> {
  try {
    return (await readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim() || null;
  } catch {
    return null;
  }
}

type GuardState = {
  lastWall: number;
  lastMono: number;
  lastDbCheck: number;
  running: Promise<void> | null;
};
const g = globalThis as typeof globalThis & { __clockGuard__?: GuardState };
function state(): GuardState {
  return (g.__clockGuard__ ??= {
    lastWall: Date.now(),
    lastMono: performance.now(),
    lastDbCheck: 0,
    running: null,
  });
}

/**
 * Shift everything that stores an absolute time by `stepMs`, so durations (what
 * the customer paid for) are preserved across the clock correction.
 */
export async function applyClockStep(stepMs: number): Promise<number> {
  const sql = await getSql();
  const ms = Math.round(stepMs);
  const pk = await sql<{ id: string }>`
    update customer_packages
    set start_time = start_time + (${ms}::double precision * interval '1 millisecond'),
        expiry_time = expiry_time + (${ms}::double precision * interval '1 millisecond'),
        updated_at = now()
    where status in ('ACTIVE', 'QUEUED')
    returning id
  `;
  await sql`
    update mikrotiks
    set down_since = down_since + (${ms}::double precision * interval '1 millisecond')
    where down_since is not null
  `;
  await sql`
    update mikrotiks
    set closed_since = closed_since + (${ms}::double precision * interval '1 millisecond')
    where closed_since is not null
  `;
  await sql`
    update payments
    set next_activation_retry_at = next_activation_retry_at + (${ms}::double precision * interval '1 millisecond')
    where next_activation_retry_at is not null
      and activation_status in ('ACTIVATION_FAILED', 'NOT_ACTIVATED')
  `;
  return pk.length;
}

async function dbGuard(inProcessStepMs: number): Promise<void> {
  const sql = await getSql();
  const wallMs = Date.now();
  const steadyMs = await readSteadyMs();
  const bootId = await readBootId();

  const rows = await sql<{ wall_ms: number; uptime_ms: number | null; boot_id: string | null }>`
    select wall_ms, uptime_ms, boot_id from clock_heartbeat where id = ${HEARTBEAT_ID} limit 1
  `;
  const prev = rows[0];

  if (!prev) {
    await sql`
      insert into clock_heartbeat (id, wall_ms, uptime_ms, boot_id)
      values (${HEARTBEAT_ID}, ${wallMs}, ${steadyMs}, ${bootId})
      on conflict (id) do nothing
    `;
    return;
  }

  let step = 0;
  const sameBoot = prev.boot_id && bootId && prev.boot_id === bootId;
  if (sameBoot && prev.uptime_ms != null && steadyMs != null) {
    step = computeClockStep(
      { wallMs: Number(prev.wall_ms), steadyMs: Number(prev.uptime_ms) },
      { wallMs, steadyMs },
    );
  } else if (!steadyMs || !prev.boot_id) {
    // No /proc to compare with: fall back to what this process itself saw.
    step = inProcessStepMs;
  }

  // Compare-and-swap so only ONE caller (tick, poller, portal read) applies a step.
  const won = await sql<{ id: string }>`
    update clock_heartbeat
    set wall_ms = ${wallMs}, uptime_ms = ${steadyMs}, boot_id = ${bootId}, updated_at = now()
    where id = ${HEARTBEAT_ID} and wall_ms = ${Number(prev.wall_ms)}
    returning id
  `;
  if (!won.length || Math.abs(step) < STEP_THRESHOLD_MS) return;

  const n = await applyClockStep(step);
  console.warn(`[clock] system clock stepped ${step > 0 ? "forward" : "back"} ${fmtDuration(step)}; shifted ${n} package(s)`);
  await logEvent(
    "CLOCK",
    `Server clock was corrected ${step > 0 ? "forward" : "back"} by ${fmtDuration(step)} (now ${fmtLocal(wallMs)}). ` +
      `${n} running/queued package(s) were shifted by the same amount so customers keep the full time they paid for.`,
  ).catch(() => {});
}

/**
 * Call before anything that decides "has this package expired?". Cheap: a pure
 * in-process check on every call, and a database heartbeat at most once a minute
 * (immediately if this process saw the clock jump).
 */
export async function ensureClockSane(force = false): Promise<void> {
  const s = state();
  const wall = Date.now();
  const mono = performance.now();
  const inProcessStep = computeClockStep(
    { wallMs: s.lastWall, steadyMs: s.lastMono },
    { wallMs: wall, steadyMs: mono },
  );
  const jumped = Math.abs(inProcessStep) >= STEP_THRESHOLD_MS;
  s.lastWall = wall;
  s.lastMono = mono;

  if (!force && !jumped && wall - s.lastDbCheck < 60_000) return;
  if (s.running) return s.running; // someone is already checking; wait for them
  s.lastDbCheck = wall;
  s.running = dbGuard(jumped ? inProcessStep : 0)
    .catch((err) => console.error("[clock] guard failed", err))
    .finally(() => {
      s.running = null;
    });
  return s.running;
}

// ---------------------------------------------------------------------------
// Skew against real time
// ---------------------------------------------------------------------------

const TIME_SOURCES = [
  "https://api.safaricom.co.ke",
  "https://www.cloudflare.com",
  "https://www.google.com",
];

type Skew = { offsetMs: number | null; checkedAt: number; sources: number };
const sg = globalThis as typeof globalThis & { __clockSkew__?: Skew; __clockWarnedAt__?: number };

async function dateHeaderOffset(url: string): Promise<number | null> {
  try {
    const t0 = Date.now();
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(4000) });
    const t1 = Date.now();
    const h = res.headers.get("date");
    if (!h) return null;
    const server = new Date(h).getTime();
    if (Number.isNaN(server)) return null;
    // Date header has 1s resolution (truncated), so add half a second.
    return server + 500 - (t0 + t1) / 2;
  } catch {
    return null;
  }
}

/** Real time minus VPS time, in ms (positive = the VPS clock is BEHIND). Cached 10 min. */
export async function measureClockSkew(force = false): Promise<number | null> {
  const cur = sg.__clockSkew__;
  if (!force && cur && Date.now() - cur.checkedAt < 10 * 60_000) return cur.offsetMs;
  const got = (await Promise.all(TIME_SOURCES.map(dateHeaderOffset))).filter((x): x is number => x != null);
  got.sort((a, b) => a - b);
  const offsetMs = got.length ? got[Math.floor(got.length / 2)] : null;
  sg.__clockSkew__ = { offsetMs, checkedAt: Date.now(), sources: got.length };

  if (offsetMs != null && Math.abs(offsetMs) > 60_000 && Date.now() - (sg.__clockWarnedAt__ ?? 0) > 3_600_000) {
    sg.__clockWarnedAt__ = Date.now();
    await logEvent(
      "CLOCK",
      `Server clock is ${fmtDuration(offsetMs)} ${offsetMs > 0 ? "BEHIND" : "AHEAD OF"} real time. ` +
        `Fix the VPS clock: run "sudo bash deploy/fix-clock.sh" on the server. ` +
        `Packages are protected automatically when the clock is corrected.`,
    ).catch(() => {});
  }
  return offsetMs;
}

/** Best estimate of real "now": the VPS clock plus the last measured skew (if it is clearly off). */
export function trueNowMs(): number {
  const off = sg.__clockSkew__?.offsetMs;
  return Date.now() + (off != null && Math.abs(off) > 2_000 ? off : 0);
}
