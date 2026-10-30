/**
 * How far the wall clock jumped beyond normal passage of time (positive = forward,
 * negative = back). `steadyMs` is a clock NTP cannot step (boot uptime / monotonic).
 */
export function computeClockStep(
  prev: { wallMs: number; steadyMs: number },
  now: { wallMs: number; steadyMs: number },
): number {
  return now.wallMs - prev.wallMs - (now.steadyMs - prev.steadyMs);
}
