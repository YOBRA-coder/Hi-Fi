import { getSql } from "@/lib/db";
import { getSettings } from "./settings.server";
import { hasFreshContext } from "./hardware";

export const AWAY_BLOCK_MESSAGE =
  "Connect to the Wi-Fi first, then open the login page and try again. Your package starts as soon as you are connected.";

/**
 * One rule for every way of getting a package (M-Pesa, voucher, loyalty points): is this
 * phone at the router? Per the "pay away" setting a phone that is not here is either
 * blocked or its package is parked until it arrives (away = true).
 */
export async function awayGate(token: string | null | undefined): Promise<{ blocked: boolean; away: boolean }> {
  const settings = await getSettings();
  if (settings.payAwayMode === "off") return { blocked: false, away: false };
  if (await hasFreshContext(token)) return { blocked: false, away: false };
  return settings.payAwayMode === "block" ? { blocked: true, away: false } : { blocked: false, away: true };
}

// ---------------------------------------------------------------------------------------------
// "Is this request coming from behind the hotspot?"  Router login visits (the entry route) reach
// the app from the hotspot's public IP, so we remember those. A later request from the same IP,
// e.g. the installed app, is on the hotspot Wi-Fi. Private addresses (app on the same LAN) count too.
// ---------------------------------------------------------------------------------------------
function firstIp(v: string | null | undefined): string | null {
  const ip = v?.split(",")[0]?.trim();
  return ip ? ip.replace(/^::ffff:/, "") : null;
}

export function requestIp(request: Request): string | null {
  const h = request.headers;
  return (
    firstIp(h.get("cf-connecting-ip")) ??
    firstIp(h.get("x-forwarded-for")) ??
    firstIp(h.get("x-real-ip"))
  );
}

function isPrivateIp(ip: string): boolean {
  return (
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^127\./.test(ip) ||
    /^169\.254\./.test(ip)
  );
}

/** Remember where router login traffic comes from. Never throws. */
export async function recordSiteIp(request: Request): Promise<void> {
  try {
    const ip = requestIp(request);
    if (!ip || isPrivateIp(ip)) return;
    const sql = await getSql();
    await sql`
      insert into site_public_ips (ip, seen_at) values (${ip}, now())
      on conflict (ip) do update set seen_at = now()
    `;
  } catch {
    /* best effort */
  }
}

/** True when the request being served comes from a known hotspot network (or the local network). */
export async function isOnSiteNetwork(): Promise<boolean> {
  try {
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    const ip = req ? requestIp(req) : null;
    if (!ip) return false;
    if (isPrivateIp(ip)) return true;
    const sql = await getSql();
    const r = await sql<{ n: number }>`
      select count(*)::int as n from site_public_ips
      where ip = ${ip} and seen_at > now() - interval '30 days'
    `;
    return Number(r[0]?.n ?? 0) > 0;
  } catch {
    return false;
  }
}
