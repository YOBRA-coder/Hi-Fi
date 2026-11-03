import { AsyncLocalStorage } from "node:async_hooks";

/** Per-activation counters for router API calls, so the ACTIVATED event can say where the time went. */
export type RouterTiming = { calls: number; ms: number };
export const routerTiming = new AsyncLocalStorage<RouterTiming>();

export function recordRouterCall(ms: number) {
  const s = routerTiming.getStore();
  if (s) {
    s.calls += 1;
    s.ms += ms;
  }
}
