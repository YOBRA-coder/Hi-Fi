import { useEffect, useState } from "react";
import { startWifiHandshake } from "@/lib/device";
import { wifiStatus } from "@/lib/fn/portal";

/**
 * Installed app (PWA): it is not sent through the router's login page, so the router never tells us
 * which phone this is. When the phone is on the hotspot Wi-Fi but not linked yet, link it by itself
 * (a quick trip through the router login page and back) behind the Hi-Fi loading screen, before the
 * customer can hit a "connect to the Wi-Fi" message. Returns true while that trip is starting.
 */
export function useWifiHandshake(
  token: string | undefined,
  routerLoginUrl: string | null | undefined,
  enabled: boolean,
): boolean {
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!enabled || !token || !routerLoginUrl) return;
    let off = false;
    wifiStatus({ data: { token } })
      .then((s) => {
        if (off || s.fresh || !s.onSite) return;
        if (startWifiHandshake(routerLoginUrl)) setBusy(true);
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [enabled, token, routerLoginUrl]);
  return busy;
}
