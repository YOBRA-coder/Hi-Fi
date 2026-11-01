/**
 * Run `fn` once per key at a time. A second caller with the SAME key and the SAME
 * token while the first is still running gets the first caller's result instead of
 * starting a parallel run; a caller with a different token waits its turn.
 *
 * Used for payment activation: the M-Pesa callback, the portal status poll, the
 * 1-minute retry tick and the "Already paid?" button can all try to activate the
 * same payment within seconds. Running them in parallel created duplicate
 * customer_packages rows and let one run's router login delete the other's.
 */
export type FlightMap<T> = Map<string, { promise: Promise<T>; token: string }>;

export function singleFlight<T>(
  map: FlightMap<T>,
  key: string,
  token: string,
  fn: () => Promise<T>,
): Promise<T> {
  const cur = map.get(key);
  if (cur && cur.token === token) return cur.promise;
  const prev = cur?.promise;
  const promise: Promise<T> = (prev ? prev.then(() => undefined, () => undefined) : Promise.resolve()).then(fn);
  const entry = { promise, token };
  map.set(key, entry);
  const clear = () => {
    if (map.get(key) === entry) map.delete(key);
  };
  promise.then(clear, clear);
  return promise;
}
