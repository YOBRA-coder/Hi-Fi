import { getSql } from "@/lib/db";
import { recordSiteIp } from "@/lib/services/presence.server";
import { getHwRouter, saveClientContext, siteSlugForRouter } from "./index";
import { onlinePage, safeContinueUrl, tryAutoReconnect } from "./auto-reconnect.server";

/** Omada external-portal landing: remember who the client is, then show the normal portal. */
export async function handleOmadaEntry(request: Request, routerId: string): Promise<Response> {
  void recordSiteIp(request);
  const router = await getHwRouter(routerId);
  // Not an Omada/Ruijie row: it is a MikroTik (router id) or a site slug such as "main".
  if (!router) return handleMikrotikEntry(request, routerId);
  if (router.type !== "omada") return new Response("Not found", { status: 404 });
  const q = new URL(request.url).searchParams;
  const ctxId = await saveClientContext({
    routerId,
    vendor: "omada",
    clientMac: q.get("clientMac") ?? "",
    apMac: q.get("apMac"),
    ssid: q.get("ssidName"),
    radioId: q.get("radioId"),
    siteName: q.get("site"),
    extra: {
      gatewayMac: q.get("gatewayMac") ?? "",
      vid: q.get("vid") ?? "",
      t: q.get("t") ?? "",
      redirectUrl: q.get("redirectUrl") ?? "",
    },
  });
  // Package still running on this phone: switch it back on and skip the portal entirely.
  const auto = await tryAutoReconnect({ routerId, clientMac: q.get("clientMac") ?? "", ctxId });
  if (auto.ok) {
    const back = safeContinueUrl(q.get("redirectUrl"));
    return back ? Response.redirect(back, 302) : onlinePage(null);
  }
  const slug = await siteSlugForRouter(routerId);
  const u = new URL("/portal", request.url);
  if (slug) u.searchParams.set("site", slug);
  if (ctxId) u.searchParams.set("hwc", ctxId);
  return Response.redirect(u.toString(), 302);
}

/**
 * MikroTik hotspot landing. The router's hotspot/login.html redirects here:
 *   https://<app>/api/hw/entry/<site-slug or router id>?mac=$(mac)&ip=$(ip)
 * We remember the phone's MAC + IP, then show the normal portal. After payment
 * the app uses them to log exactly this phone in on the router.
 */
export async function handleMikrotikEntry(request: Request, key: string): Promise<Response> {
  void recordSiteIp(request);
  const sql = await getSql();
  const rows = await sql<{ id: string; slug: string | null }>`
    select m.id, s.slug
    from mikrotiks m
    left join sites s on s.id = m.site_id
    where m.hardware_type = 'mikrotik' and (m.id = ${key} or s.slug = ${key})
    order by m.is_primary desc, m.created_at
    limit 1
  `;
  // The key is only a hint: if it matches nothing (wrong slug), use the primary MikroTik
  // so the customer still reaches the portal instead of a "Not found" page.
  let r = rows[0];
  if (!r) {
    const fb = await sql<{ id: string; slug: string | null }>`
      select m.id, s.slug
      from mikrotiks m
      left join sites s on s.id = m.site_id
      where m.hardware_type = 'mikrotik'
      order by m.is_primary desc, m.created_at
      limit 1
    `;
    r = fb[0];
  }
  if (!r) return new Response("Not found", { status: 404 });
  const q = new URL(request.url).searchParams;
  const ctxId = await saveClientContext({
    routerId: r.id,
    vendor: "mikrotik",
    clientMac: q.get("mac") ?? "",
    clientIp: q.get("ip"),
  });
  // Package still running on this phone: log it back in on the router and skip the portal.
  // The router's login page may pass the original URL as ?dst= ( $(link-orig) ) to continue to.
  const auto = await tryAutoReconnect({ routerId: r.id, clientMac: q.get("mac") ?? "", ctxId });
  if (auto.ok) return onlinePage(safeContinueUrl(q.get("dst")));
  const target = new URLSearchParams();
  if (r.slug) target.set("site", r.slug);
  if (ctxId) target.set("hwc", ctxId);
  const qs = target.toString();
  return new Response(null, { status: 302, headers: { Location: `/portal${qs ? `?${qs}` : ""}` } });
}
