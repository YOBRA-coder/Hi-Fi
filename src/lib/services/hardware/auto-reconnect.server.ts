import { getSql } from "@/lib/db";
import { getSettings, logEvent } from "@/lib/services/settings.server";
import { reconnectCustomer, startAwaitingForDevice } from "@/lib/services/activation.server";
import { normMac } from "./context.server";
import { siteSlugForRouter, takeHandoffUrl } from "./index";

/**
 * Silent reconnect for a phone that comes back while its package is still running.
 *
 * The router's captive-portal redirect (MikroTik login page, Omada external portal, Ruijie WiFiDog
 * login) only fires when the phone is NOT authorised on the router. If that same phone owns an
 * ACTIVE, unexpired package we switch it back on right here, before any portal page is shown, so
 * the customer never has to see the portal or tap "Connect".
 *
 * Safety rules:
 *  - Only a device that is already BOUND to the package is reconnected (same MAC / same browser
 *    token that paid or joined). A different phone using the same number still goes to the portal.
 *  - Blocked customers, closed hours, full capacity, router errors, "in use" etc. all fall through
 *    to the normal portal page, which explains the problem.
 *  - A short per-MAC cooldown stops a redirect loop: if the router login silently fails, the
 *    router would send the phone straight back here; the second visit within the cooldown goes to
 *    the portal instead of retrying forever.
 */

const COOLDOWN_MS = 20_000;
const lastTry = new Map<string, number>();

export type AutoReconnect =
  | { ok: true; handoffUrl: string | null; customerId: string }
  | { ok: false; reason: string };

async function siteIdForRouter(routerId: string): Promise<string | null> {
  const slug = await siteSlugForRouter(routerId);
  if (!slug) return null;
  const sql = await getSql();
  const r = await sql<{ id: string }>`
    select id from sites where slug = ${slug} and status = 'ACTIVE' limit 1
  `;
  return r[0]?.id ?? null;
}

export async function tryAutoReconnect(opts: {
  routerId: string;
  clientMac: string;
  /** The hw_clients row just saved for this visit; tied to the phone's identity before switching it on. */
  ctxId?: string | null;
}): Promise<AutoReconnect> {
  try {
    const mac = normMac(opts.clientMac);
    if (mac.length !== 12) return { ok: false, reason: "no_mac" };

    const now = Date.now();
    const prev = lastTry.get(mac);
    if (prev && now - prev < COOLDOWN_MS) return { ok: false, reason: "cooldown" };
    for (const [k, t] of lastTry) if (now - t > COOLDOWN_MS * 5) lastTry.delete(k);

    const sql = await getSql();
    const settings = await getSettings();

    // Every identity this phone may be known by: MAC identity (MikroTik) and any browser token
    // that was tied to this MAC by an earlier portal visit (Omada / Ruijie / pre-MAC MikroTik).
    const known = await sql<{ device_token: string }>`
      select distinct device_token from hw_clients
      where mac_norm = ${mac} and device_token is not null
    `;
    const tokens = [...new Set([`mac_${mac}`, ...known.map((r) => r.device_token)])];

    // A package paid for from the link while this phone was away starts the moment it shows up.
    for (const t of tokens) {
      const started = await startAwaitingForDevice(t, {
        siteId: await siteIdForRouter(opts.routerId),
      }).catch(() => false);
      if (started) break;
    }

    const rows = await sql<{ id: string; customer_id: string; token: string }>`
      select cp.id, cp.customer_id, d.device_token as token
      from customer_package_devices d
      join customer_packages cp on cp.id = d.customer_package_id
      join customers c on c.id = cp.customer_id
      where d.device_token = any(${tokens}::text[])
        and cp.status = 'ACTIVE' and cp.expiry_time > now()
        and c.status != 'BLOCKED'
      order by cp.expiry_time desc
      limit 1
    `;
    let hit = rows[0];
    if (!hit && !settings.oneDevicePerPackage) {
      // No device binding in this mode: the customer's last known device token is the identity.
      const legacy = await sql<{ id: string; customer_id: string; token: string }>`
        select cp.id, cp.customer_id, c.device_token as token
        from customers c
        join customer_packages cp on cp.customer_id = c.id
        where c.device_token = any(${tokens}::text[])
          and cp.status = 'ACTIVE' and cp.expiry_time > now()
          and c.status != 'BLOCKED'
        order by cp.expiry_time desc
        limit 1
      `;
      hit = legacy[0];
    }
    if (!hit) return { ok: false, reason: "no_active_package" };

    lastTry.set(mac, now);
    if (opts.ctxId) {
      // The fresh redirect (new Omada session id / MikroTik IP) must be the context used to log the phone in.
      await sql`
        update hw_clients set device_token = ${hit.token}, seen_at = now()
        where id = ${opts.ctxId} and (device_token is null or device_token = ${hit.token})
      `;
    }
    const res = await reconnectCustomer(hit.customer_id, {
      token: hit.token,
      packageId: hit.id,
      siteId: await siteIdForRouter(opts.routerId),
    });
    if (!res.ok) return { ok: false, reason: res.reason };

    await logEvent(
      "AUTO_RECONNECT",
      `Phone ${mac} came back with package ${hit.id} still active: reconnected without showing the portal.`,
    ).catch(() => {});
    // Ruijie only: the gateway still needs the browser to visit its auth URL once.
    const handoffUrl = await takeHandoffUrl(hit.token).catch(() => null);
    return { ok: true, handoffUrl, customerId: hit.customer_id };
  } catch (err) {
    console.error("[auto-reconnect] failed:", err instanceof Error ? err.message : err);
    return { ok: false, reason: "error" };
  }
}

/** Only plain http(s) URLs are ever used as a "continue to" target. */
export function safeContinueUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Tiny "you're online" page for phones whose captive-portal browser has no URL to continue to. */
export function onlinePage(continueUrl: string | null): Response {
  const next = continueUrl
    ? `<meta http-equiv="refresh" content="1;url=${continueUrl.replace(/"/g, "&quot;")}">`
    : "";
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>You are online</title>${next}
<style>body{font-family:system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;background:#0b0f14;color:#e8eef5;text-align:center}main{padding:24px}h1{font-size:28px;margin:0 0 8px}p{opacity:.7;margin:0}</style>
</head><body><main><h1>You are online</h1><p>Your package is still active. You can close this page.</p></main></body></html>`;
  return new Response(html, { status: 200, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
