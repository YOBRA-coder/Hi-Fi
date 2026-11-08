
const POLL_INTERVAL_MS = 60_000;

async function pollOnce() {
  // Paid-but-unconfirmed M-Pesa payments get settled even if the customer closed the app.
  void import("@/lib/services/callback.server")
    .then((m) => m.reconcilePendingPayments())
    .catch(() => {});
  try {
    // Every router (not just the primary) so outages are noticed — and
    // credited — per router. Imported lazily to avoid a db.ts import cycle.
    // Shift packages first if the server clock was just corrected.
    const { ensureClockSane, measureClockSkew } = await import("@/lib/services/clock.server");
    await ensureClockSane(true).catch(() => {});
    void measureClockSkew().catch(() => {});
    const { probeAllRouters } = await import("@/lib/services/outage.server");
    await probeAllRouters();
  } catch (err) {
    console.error("[router-watch] poll failed:", err);
  }
}

const globalRef = globalThis as typeof globalThis & {
  __routerWatchStarted__?: boolean;
};

/**
 * Starts the periodic primary-router probe, once per process. Only makes
 * sense on a long-lived server (this app's dev/VPS deploy -- see
 * startup.sh), not a per-request serverless function; harmless no-op
 * either way since it just skips probing when unconfigured.
 */
export function startRouterWatch() {
  if (typeof window !== "undefined") return; // never in the browser bundle
  if (globalRef.__routerWatchStarted__) return; // survive HMR re-imports
  globalRef.__routerWatchStarted__ = true;
  setInterval(() => {
    void pollOnce();
  }, POLL_INTERVAL_MS);
  // Queued packages take over from an ending one within seconds, without the phone being logged out.
  setInterval(() => {
    void import("@/lib/services/handover.server").then((m) => m.handoverTick()).catch(() => {});
  }, 15_000);
}

startRouterWatch();
