const KEY = "telnet.device";

export const PACKAGE_IN_USE_MESSAGE =
  "This package is already in use on another device.";

export type DeviceIdentity = {
  token: string;
  phone: string | null;
  customerId: string | null;
};

function randomToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `tok_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function readDevice(): DeviceIdentity {
  if (typeof window === "undefined") {
    return { token: "tok_ssr", phone: null, customerId: null };
  }
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DeviceIdentity;
      if (parsed.token && parsed.token.length >= 8) return parsed;
    }
  } catch {
    /* ignore */
  }
  const fresh: DeviceIdentity = { token: randomToken(), phone: null, customerId: null };
  writeDevice(fresh);
  return fresh;
}

export function writeDevice(next: DeviceIdentity) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function patchDevice(patch: Partial<DeviceIdentity>): DeviceIdentity {
  const cur = readDevice();
  const next = { ...cur, ...patch };
  writeDevice(next);
  return next;
}

export function deviceInfo(): string {
  if (typeof navigator === "undefined") return "Captive portal";
  return navigator.userAgent.slice(0, 80);
}

const SITE_KEY = "telnet.site";

/** The site/town slug from the router's portal link (?site=slug), remembered on this device. */
export function readSite(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("site");
    if (fromUrl) {
      localStorage.setItem(SITE_KEY, fromUrl);
      return fromUrl;
    }
    return localStorage.getItem(SITE_KEY) || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Where "Connect to the Wi-Fi" sends the customer: the router's own hotspot login page, which
 * redirects back to this app with the phone's MAC and IP (the router's login.html does that).
 * Returns null when the operator has not set the address.
 */
export function wifiLoginHref(routerLoginUrl: string | null | undefined): string | null {
  if (!routerLoginUrl || typeof window === "undefined") return null;
  const site = readSite();
  const back = `${window.location.origin}/portal${site ? `?site=${encodeURIComponent(site)}` : ""}`;
  const sep = routerLoginUrl.includes("?") ? "&" : "?";
  return `${routerLoginUrl}${sep}dst=${encodeURIComponent(back)}`;
}

const HANDSHAKE_KEY = "hifi_wifi_handshake";
const HANDSHAKE_COOLDOWN_MS = 10 * 60_000;
const HANDSHAKE_RETURN_MS = 3 * 60_000;

/**
 * Send the phone through the router's login page and straight back, so the router tells us this
 * phone's MAC/IP. At most once per 10 minutes (so it can never loop). Remembers the page to come
 * back to. Returns false when it did nothing (no address set, or tried recently).
 */
export function startWifiHandshake(routerLoginUrl: string | null | undefined): boolean {
  const href = wifiLoginHref(routerLoginUrl);
  if (!href || typeof window === "undefined") return false;
  try {
    const last = JSON.parse(window.localStorage.getItem(HANDSHAKE_KEY) ?? "null") as { at?: number } | null;
    if (last?.at && Date.now() - last.at < HANDSHAKE_COOLDOWN_MS) return false;
    window.localStorage.setItem(
      HANDSHAKE_KEY,
      JSON.stringify({ at: Date.now(), back: window.location.pathname + window.location.search }),
    );
  } catch {
    return false; // no storage: cannot guarantee it will not loop
  }
  window.location.assign(href);
  return true;
}

/** After the round trip: the page the customer was on (once), so they carry on where they were. */
export function takeWifiReturn(): string | null {
  try {
    const raw = JSON.parse(window.localStorage.getItem(HANDSHAKE_KEY) ?? "null") as
      | { at?: number; back?: string }
      | null;
    if (!raw?.back || !raw.at || Date.now() - raw.at > HANDSHAKE_RETURN_MS) return null;
    window.localStorage.setItem(HANDSHAKE_KEY, JSON.stringify({ at: raw.at }));
    return raw.back.startsWith("/portal") && !raw.back.startsWith("//") ? raw.back : null;
  } catch {
    return null;
  }
}
