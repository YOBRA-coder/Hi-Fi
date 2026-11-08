/**
 * Seamless hand-over between a package that is ending and the queued package behind it.
 *
 * The customer should not notice: no kick, no captive-portal pop-up. Two parts:
 *  - a little before the active package ends, its router session is renewed with a few minutes of grace
 *    (see activateFromPayment) so the router does not log the phone out at the exact second it expires;
 *  - when the sweep promotes the queued package it re-logs the same phone(s) in at once.
 * This file is the "a little before" part, run every 15 seconds by the server's watcher.
 */
import { getSql } from "@/lib/db";
import { expireDuePackages } from "./expiry.server";

const PREPARE_WINDOW_SEC = 150;
const prepared = new Map<string, number>();

/** Re-log every device of this package in (best effort, one after the other). */
export async function relinkBoundDevices(customerId: string, packageId: string): Promise<void> {
  const { reconnectCustomer } = await import("./activation.server");
  const sql = await getSql();
  const devices = await sql<{ device_token: string }>`
    select device_token from customer_package_devices where customer_package_id = ${packageId}
  `;
  if (devices.length === 0) {
    await reconnectCustomer(customerId, { packageId }).catch(() => {});
    return;
  }
  for (const d of devices) {
    await reconnectCustomer(customerId, { token: d.device_token, packageId }).catch(() => {});
  }
}

/** Renew the router session of packages about to end that have another package queued behind them. */
export async function prepareHandovers(): Promise<number> {
  const sql = await getSql();
  const rows = await sql<{ id: string; customer_id: string }>`
    select cp.id, cp.customer_id
    from customer_packages cp
    where cp.status = 'ACTIVE' and cp.expiry_time > now()
      and cp.expiry_time <= now() + (${PREPARE_WINDOW_SEC}::int * interval '1 second')
      and exists (
        select 1 from customer_packages q
        where q.customer_id = cp.customer_id and q.status = 'QUEUED'
          and q.activation_status is distinct from 'AWAITING_DEVICE'
          and q.mikrotik_username is not distinct from cp.mikrotik_username
      )
  `;
  let n = 0;
  const now = Date.now();
  for (const [id, at] of prepared) if (now - at > 15 * 60_000) prepared.delete(id);
  for (const row of rows) {
    if (prepared.has(row.id)) continue;
    prepared.set(row.id, now);
    await relinkBoundDevices(String(row.customer_id), String(row.id));
    n++;
  }
  return n;
}

/** Every 15 seconds: prepare upcoming hand-overs, then run the expiry sweep (which promotes queued packages). */
export async function handoverTick(): Promise<void> {
  try {
    await prepareHandovers();
  } catch (err) {
    console.error("[handover] prepare failed:", err);
  }
  await expireDuePackages().catch((err) => console.error("[handover] sweep failed:", err));
}
