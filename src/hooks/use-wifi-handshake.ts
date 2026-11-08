import { useCallback, useEffect, useState } from "react";
import { readDevice, startWifiHandshake } from "@/lib/device";
import { wifiStatus } from "@/lib/fn/portal";

const POLL_MS = 2000;
const GIVE_UP_MS = 15_000;

/**
 * Installed app (PWA): it is not sent through the router's login page, so the router never tells us
 * which phone this is. When the phone is on the hotspot Wi-Fi but not linked yet, link it by itself
 * (a quick trip through the router login page and back) behind the Hi-Fi loading screen.
 *
 * On Android the trip often runs in a small browser window layered over the app, so the app page itself
 * never reloads. So while "linking" it keeps asking the server whether the phone is linked now, re-checks
 * the moment the app is shown again, picks up the phone's new stable identity (the trip replaces the
 * stored device token) with a reload, and gives up after 15 seconds instead of spinning forever.
 */
export function useWifiHandshake(
  token: string | undefined,
  routerLoginUrl: string | null | undefined,
  enabled: boolean,
) {
  const [phase, setPhase] = useState<"idle" | "linking" | "failed">("idle");

  // 1. On open: linked already? on the Wi-Fi but not linked? start the trip.
  useEffect(() => {
    if (!enabled || !token || !routerLoginUrl) return;
    let off = false;
    wifiStatus({ data: { token } })
      .then((s) => {
        if (off || s.fresh || !s.onSite) return;
        setPhase(startWifiHandshake(routerLoginUrl) ? "linking" : "failed");
      })
      .catch(() => {});
    return () => {
      off = true;
    };
  }, [enabled, token, routerLoginUrl]);

  // 2. While the trip runs: notice when it has finished, even if this page never reloaded.
  useEffect(() => {
    if (phase !== "linking" || !token) return;
    let off = false;
    const started = Date.now();
    const check = async () => {
      if (off) return;
      const current = readDevice().token;
      if (current !== token) {
        // The trip gave this phone its stable identity: restart the page with it.
        window.location.reload();
        return;
      }
      try {
        const s = await wifiStatus({ data: { token: current } });
        if (off) return;
        if (s.fresh) {
          setPhase("idle");
          return;
        }
      } catch {
        /* keep trying until the time is up */
      }
      if (!off && Date.now() - started > GIVE_UP_MS) setPhase("failed");
    };
    const id = window.setInterval(() => void check(), POLL_MS);
    const onShown = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onShown);
    window.addEventListener("pageshow", onShown);
    window.addEventListener("focus", onShown);
    return () => {
      off = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onShown);
      window.removeEventListener("pageshow", onShown);
      window.removeEventListener("focus", onShown);
    };
  }, [phase, token]);

  /** Start the trip now (e.g. the customer tapped Pay first). False when it could not start. */
  const begin = useCallback(() => {
    if (!routerLoginUrl) return false;
    if (startWifiHandshake(routerLoginUrl)) {
      setPhase("linking");
      return true;
    }
    setPhase("failed");
    return false;
  }, [routerLoginUrl]);

  return { linking: phase === "linking", failed: phase === "failed", begin };
}
