/**
 * Who may manage the devices of a shared (2-device) package, and how one device is
 * removed from it. The owner is the account that bought the package; the "payer
 * device" is the phone the payment was made from.
 */
import { createHash } from "node:crypto";
import { getSql } from "@/lib/db";
import { getSessionCustomer } from "./customer-auth.server";
import { disconnectDevice } from "./hardware";
import { logEvent } from "./settings.server";

/** Signed-in, registered session of the account that owns this customer's packages. */
export async function isOwnerSession(token: string, customerId: string): Promise<boolean> {
  const m = await getSessionCustomer(token);
  return Boolean(m?.registered && m.id === customerId);
}

/** The phone the package's payment was made from (null if unknown). */
export async function payerToken(packageId: string): Promise<string | null> {
  const sql = await getSql();
  const r = await sql<{ device_token: string | null }>`
    select p.device_token from customer_packages cp
    join payments p on p.id = cp.payment_id
    where cp.id = ${packageId} limit 1
  `;
  return r[0]?.device_token ?? null;
}

/**
 * The owner side: the signed-in account, or the phone that paid. Sharing a code needs
 * the signed-in account (see createShareCode); removing someone also lets the payer phone act.
 */
export async function canManageDevices(
  token: string,
  pack: { id: string; customer_id: string },
): Promise<boolean> {
  if (await isOwnerSession(token, pack.customer_id)) return true;
  return (await payerToken(pack.id)) === token;
}

/** Opaque id for a bound device so the real device token never leaves the server. */
export function deviceRef(packageId: string, deviceToken: string): string {
  return createHash("sha256").update(`${packageId}:${deviceToken}`).digest("hex").slice(0, 16);
}

/**
 * May this device act for this customer at all? Used so that knowing a phone number (or a
 * customer id) is not enough to take a free device slot: the device must already be the
 * customer's device, a device that paid, a bound device, or signed in as that customer.
 */
export async function deviceMayActFor(token: string, customerId: string): Promise<boolean> {
  const sql = await getSql();
  const r = await sql<{ ok: boolean }>`
    select (
      exists (select 1 from customers where id = ${customerId} and device_token = ${token})
      or exists (select 1 from payments where customer_id = ${customerId} and device_token = ${token})
      or exists (
        select 1 from customer_package_devices d
        join customer_packages cp on cp.id = d.customer_package_id
        where cp.customer_id = ${customerId} and d.device_token = ${token}
      )
      or exists (select 1 from customer_sessions where customer_id = ${customerId} and device_token = ${token})
    ) as ok
  `;
  return Boolean(r[0]?.ok);
}

/** Free this device's slot and switch only this phone off. Returns whether the router was told. */
export async function removeBoundDevice(
  pack: { id: string; customer_id: string; mikrotik_username: string | null },
  deviceToken: string,
  by: "owner" | "self",
): Promise<{ kicked: boolean }> {
  const sql = await getSql();
  let kicked = false;
  if (pack.mikrotik_username) {
    kicked = await disconnectDevice(deviceToken, pack.mikrotik_username).catch(() => false);
  }
  await sql`
    delete from customer_package_devices
    where customer_package_id = ${pack.id} and device_token = ${deviceToken}
  `;
  // A code made for the slot that was just freed should not outlive the device it was for.
  await sql`
    delete from device_share_codes where customer_package_id = ${pack.id} and used_at is null
  `;
  await logEvent(
    "DEVICE_REMOVED",
    by === "owner"
      ? `Owner removed a device from package ${pack.id}.`
      : `A device left shared package ${pack.id} by itself.`,
  ).catch(() => {});
  return { kicked };
}
