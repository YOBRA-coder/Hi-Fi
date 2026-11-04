/**
 * Student-package domain blocking: turns the operator's short list
 * ("tiktok.com, x.com") into every hostname the *apps* actually use.
 *
 * Why this exists: browsers open "tiktok.com", but the TikTok app talks to
 * api16-normal-*.tiktokv.com and video.tiktokcdn.com, the X app loads media
 * from video.twimg.com, Instagram/Facebook apps use fbcdn.net, and so on.
 * Blocking only the name the operator typed therefore blocks the website and
 * leaves the app working.
 */

/** Registrable domain -> other domains the same service's apps depend on. */
const COMPANIONS: Record<string, string[]> = {
  "tiktok.com": [
    "tiktokv.com", "tiktokcdn.com", "tiktokcdn-us.com", "tiktokw.us", "ttwstatic.com",
    "byteoversea.com", "ibytedtos.com", "ibyteimg.com", "muscdn.com", "musical.ly",
    "tiktokd.net", "tik-tokapi.com",
  ],
  "x.com": ["twitter.com", "twimg.com", "t.co", "twitter.map.fastly.net", "ads-twitter.com"],
  "twitter.com": ["x.com", "twimg.com", "t.co", "ads-twitter.com"],
  "facebook.com": ["fb.com", "fbcdn.net", "facebook.net", "fbsbx.com", "fb.me", "messenger.com", "fbpigeon.com"],
  "instagram.com": ["cdninstagram.com", "instagr.am", "fbcdn.net", "ig.me"],
  "youtube.com": ["youtu.be", "googlevideo.com", "ytimg.com", "youtube-nocookie.com", "youtubei.googleapis.com", "youtube.googleapis.com", "ggpht.com"],
  "netflix.com": ["nflxvideo.net", "nflximg.net", "nflxext.com", "nflxso.net", "netflix.net"],
  "snapchat.com": ["sc-cdn.net", "snap-dev.net", "snapkit.com", "feelinsonice.com", "snapads.com"],
};

/** Strip scheme, path, port, "www." and wildcards; lower-case; null if it isn't a hostname. */
export function normalizeDomain(raw: string): string | null {
  let d = raw.trim().toLowerCase();
  if (!d) return null;
  d = d.replace(/^[a-z][a-z0-9+.-]*:\/\//, "");
  d = d.split(/[/?#]/)[0] ?? "";
  d = d.replace(/:\d+$/, "").replace(/^\*\./, "").replace(/^www\./, "").replace(/\.$/, "");
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d) ? d : null;
}

/** Operator list + each service's app/CDN domains, de-duplicated and sorted. */
export function expandBlockedDomains(input: string[]): string[] {
  const out = new Set<string>();
  for (const raw of input) {
    const d = normalizeDomain(raw);
    if (!d) continue;
    out.add(d);
    // Match on the registrable domain too, so "m.youtube.com" still pulls in googlevideo.com.
    const parts = d.split(".");
    for (let i = 0; i < parts.length - 1; i++) {
      const suffix = parts.slice(i).join(".");
      for (const extra of COMPANIONS[suffix] ?? []) out.add(extra);
    }
  }
  return [...out].sort();
}

/**
 * RouterOS `tls-host` patterns for one domain. `*x.com` would also match
 * `box.com`, so the root name and its subdomains are separate patterns.
 */
export function tlsHostPatterns(domain: string): string[] {
  return [domain, `*.${domain}`];
}
