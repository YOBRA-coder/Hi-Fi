import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSql } from "@/lib/db";
import { nid, iso } from "@/lib/utils";
import { normalizeKenyanPhone } from "@/lib/phone";
import { initiateStkPush, queryStkStatus } from "@/lib/services/mpesa.server";
import { redeemVoucher } from "@/lib/services/vouchers.server";
import {
  activateFromPayment,
  reconnectCustomer,
  startAwaitingForDevice,
} from "@/lib/services/activation.server";
import { expireDuePackages } from "@/lib/services/expiry.server";
import { AWAY_BLOCK_MESSAGE, awayGate } from "@/lib/services/presence.server";
import {
  canManageDevices,
  deviceMayActFor,
  deviceRef,
  isOwnerSession,
  payerToken,
  removeBoundDevice,
} from "@/lib/services/device-share.server";
import {
  findCustomerByReferralCode,
  redeemPointsForPackage,
} from "@/lib/services/loyalty.server";
import { getHoursForSite, purchaseBlockedReason } from "@/lib/services/hours.server";
import {
  announceReferral,
  changeCustomerSecret,
  resetCustomerSecretWithReceipt,
  resetCustomerSecretWithOtp,
  requestResetOtp,
  requestSignupOtp,
  getResetOptions,
  getSessionCustomer,
  signInCustomer,
  signOutDevice,
  signUpCustomer,
} from "@/lib/services/customer-auth.server";
import { getSettings, logEvent } from "@/lib/services/settings.server";
import {
  mapCustomer,
  mapCustomerPackage,
  mapIsp,
  mapPackage,
  mapPayment,
  type SqlRow,
} from "@/lib/services/rows.server";
import type { ActiveAccess, Package } from "@/lib/types";
import { PACKAGE_IN_USE_MESSAGE } from "@/lib/device";
import { isInternetUp } from "@/lib/services/capacity.server";
import {
  adoptMacIdentity,
  bindClientContext,
  hasFreshContext,
  takeHandoffUrl,
} from "@/lib/services/hardware";

const identitySchema = z.object({
  token: z.string().min(8).max(80),
  phone: z.string().optional(),
  customerId: z.string().optional(),
});

/** Site id for the ?site=<slug> of the portal link (null = unknown / not given). */
async function siteIdFromSlug(slug?: string | null): Promise<string | null> {
  if (!slug) return null;
  const sql = await getSql();
  const r = await sql<{ id: string }>`select id from sites where slug = ${slug} and status = 'ACTIVE' limit 1`;
  return r[0]?.id ?? null;
}

/**
 * Packages a portal visitor may see. A package with no site is sold
 * everywhere; a site-scoped one only where the visitor came in through that
 * site's router (portal URL carries ?site=<slug>). With no site given the
 * visitor sees global packages plus the main site's.
 */
async function loadCatalog(siteSlug?: string | null) {
  await expireDuePackages();
  const sql = await getSql();
  const settings = await getSettings();
  const siteRow = siteSlug
    ? (
        await sql<{ id: string }>`
          select id from sites where slug = ${siteSlug} and status = 'ACTIVE' limit 1
        `
      )[0]
    : null;
  const siteId = siteRow?.id ?? "site_default";
  const packages = (
    await sql<SqlRow>`
      select * from packages
      where status = 'ACTIVE'
        and (
          (site_id is null and not exists (select 1 from package_sites ps where ps.package_id = packages.id))
          or site_id = ${siteId}
          or exists (select 1 from package_sites ps where ps.package_id = packages.id and ps.site_id = ${siteId})
        )
      order by price asc, sort_order asc, duration_minutes asc
    `
  ).map(mapPackage);
  const internetUp = await isInternetUp(siteId);
  return {
    settings: {
      hotspotName: settings.hotspotName,
      welcomeMessage: settings.welcomeMessage,
      currency: settings.currency,
      demoMode: false,
      maintenanceMode: settings.maintenanceMode,
      maintenanceMessage: settings.maintenanceMessage,
      routerLoginUrl: settings.routerLoginUrl,
      supportPhone: settings.supportPhone,
      supportWhatsapp: settings.supportWhatsapp,
      supportMessage: settings.supportMessage,
      loyaltyEnabled: settings.loyaltyEnabled,
      referralEnabled: settings.referralEnabled,
      referralMinPackagePrice: settings.referralMinPackagePrice,
      maxDevicesPerPackage: settings.maxDevicesPerPackage,
      requireAccountMultiDevice: settings.requireAccountMultiDevice,
      studentBlockedDomains: settings.studentBlockedDomains,
    },
    packages,
    internetUp,
    // Opening hours of the router that serves this visitor's site (null = no schedule)
    operating: await getHoursForSite(siteId),
  };
}

export const getPortalCatalog = createServerFn({ method: "GET" })
  .validator((data: unknown) =>
    z.object({ site: z.string().max(40).optional() }).optional().parse(data),
  )
  .handler(async ({ data }) => loadCatalog(data?.site));

async function findActiveForCustomer(
  customerId: string,
  deviceToken?: string,
): Promise<ActiveAccess> {
  const sql = await getSql();
  const settings = await getSettings();
  const rows = await sql<SqlRow>`
    select cp.*, pkg.name as package_name, pkg.max_devices, c.phone, c.status as customer_status, c.created_at,
      (select array_agg(device_token) from customer_package_devices where customer_package_id = cp.id) as bound_tokens
    from customer_packages cp
    join packages pkg on pkg.id = cp.package_id
    join customers c on c.id = cp.customer_id
    where cp.customer_id = ${customerId}
      and cp.status = 'ACTIVE'
      and cp.expiry_time > now()
    order by (cp.id in (select customer_package_id from customer_package_devices where device_token = ${deviceToken ?? null}::text)) desc,
             (cp.payment_id in (select id from payments where device_token = ${deviceToken ?? null}::text)
               and not exists (select 1 from customer_package_devices d where d.customer_package_id = cp.id)) desc,
             ((select count(*) from customer_package_devices d where d.customer_package_id = cp.id)
               < (case when pkg.max_devices >= 2 then 2 else 1 end)) desc,
             cp.expiry_time desc
    limit 1
  `;
  const row = rows[0];
  if (!row) return null;
  const sessions = await sql<{ id: string }>`
    select id from sessions
    where customer_id = ${customerId} and status = 'ACTIVE'
      and (mikrotik_username = ${row.mikrotik_username ?? null}::text or ${row.mikrotik_username ?? null}::text is null)
    limit 1
  `;
  const pack = mapCustomerPackage(row);
  const packageMaxDevices = Number(row.max_devices) >= 2 ? 2 : 1;
  const boundTokens: string[] = Array.isArray(row.bound_tokens)
    ? (row.bound_tokens as string[])
    : [];
  const otherDevice = Boolean(
    settings.oneDevicePerPackage &&
      deviceToken &&
      !boundTokens.includes(deviceToken) &&
      boundTokens.length >= packageMaxDevices,
  );
  return {
    customer: mapCustomer({
      id: row.customer_id,
      phone: row.phone,
      status: row.customer_status,
      created_at: row.created_at,
    }),
    pack,
    connected:
      !otherDevice &&
      sessions.length > 0 &&
      String(row.activation_status) === "ACTIVATED",
    otherDevice,
  };
}

/** How many devices the customer's current ACTIVE package allows (per-package, not global). */
async function activePackageMaxDevices(customerId: string): Promise<number> {
  const sql = await getSql();
  const rows = await sql<{ max_devices: number }>`
    select pkg.max_devices
    from customer_packages cp
    join packages pkg on pkg.id = cp.package_id
    where cp.customer_id = ${customerId}
      and cp.status = 'ACTIVE'
      and cp.expiry_time > now()
    order by cp.expiry_time desc
    limit 1
  `;
  return rows[0] && Number(rows[0].max_devices) >= 2 ? 2 : 1;
}

/** Every package queued behind the customer's current one, in start order. */
async function queuedPackages(
  customerId: string,
): Promise<{ packageName: string; startTime: string; expiryTime: string; awaiting: boolean }[]> {
  const sql = await getSql();
  const rows = await sql<{
    package_name: string;
    start_time: string;
    expiry_time: string;
    awaiting: boolean;
  }>`
    select pkg.name as package_name, cp.start_time, cp.expiry_time,
           (cp.activation_status = 'AWAITING_DEVICE') as awaiting
    from customer_packages cp
    join packages pkg on pkg.id = cp.package_id
    where cp.customer_id = ${customerId} and cp.status = 'QUEUED'
    order by cp.start_time asc
  `;
  return rows.map((r) => ({
    packageName: String(r.package_name),
    startTime: iso(r.start_time),
    expiryTime: iso(r.expiry_time),
    awaiting: Boolean(r.awaiting),
  }));
}

async function countUnreadNotices(customerId: string): Promise<number> {
  const sql = await getSql();
  const r = await sql<{ n: number }>`
    select count(*)::int as n from customer_notices
    where customer_id = ${customerId} and seen_at is null
  `;
  return Number(r[0]?.n ?? 0);
}

export const getPortalBootstrap = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    identitySchema.extend({ site: z.string().max(40).optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    const catalog = await loadCatalog(data.site);
    const sql = await getSql();

    let access: ActiveAccess = null;
    const phone = data.phone ? normalizeKenyanPhone(data.phone) : null;

    if (data.customerId) {
      access = await findActiveForCustomer(data.customerId, data.token);
    }
    if (!access && data.token) {
      const byToken = await sql<{ id: string }>`
        select id from customers where device_token = ${data.token} limit 1
      `;
      if (byToken[0]) {
        access = await findActiveForCustomer(byToken[0].id, data.token);
      }
    }
    if (!access && phone) {
      const byPhone = await sql<{ id: string }>`
        select id from customers where phone = ${phone} limit 1
      `;
      if (byPhone[0]) {
        access = await findActiveForCustomer(byPhone[0].id, data.token);
      }
    }

    // Who is signed in on THIS device (server-verified — the customerId a
    // browser sends is never trusted for account data).
    const member = await getSessionCustomer(data.token);
    const unread = member?.registered ? await countUnreadNotices(member.id) : 0;

    return {
      ...catalog,
      access,
      member: member
        ? { id: member.id, phone: member.phone, registered: member.registered }
        : null,
      unreadNotices: unread,
    };
  });

export const listPortalPackages = createServerFn({ method: "GET" }).handler(
  async () => {
    const sql = await getSql();
    const rows = await sql<SqlRow>`
      select * from packages where status = 'ACTIVE' order by price asc, sort_order asc, duration_minutes asc
    `;
    return rows.map(mapPackage) as Package[];
  },
);

function activationFailure(
  activation: { ok: false; reason: string },
  payment?: ReturnType<typeof mapPayment>,
) {
  if (activation.reason === "in_use") {
    return {
      ok: false as const,
      code: "in_use" as const,
      error: PACKAGE_IN_USE_MESSAGE,
    };
  }
  if (activation.reason === "expired") {
    return {
      ok: false as const,
      code: "expired" as const,
      error: "Your package has expired. Please purchase a new package.",
    };
  }
  if (activation.reason === "closed") {
    return {
      ok: false as const,
      code: "closed" as const,
      error: "We're closed right now. Your package is safe — tap Reconnect when we open.",
    };
  }
  if (activation.reason === "blocked") {
    return {
      ok: false as const,
      error: "This number is blocked. Please contact the hotspot operator.",
    };
  }
  return {
    ok: false as const,
    code: "router" as const,
    error:
      "Payment received. Your package could not be activated yet. Please use 'Already Paid?' to reconnect.",
    payment,
  };
}

export const startPayment = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        packageId: z.string(),
        phone: z.string(),
        token: z.string().min(8),
        referralCode: z.string().max(20).optional(),
        /** site slug from the router's portal link (?site=...) */
        site: z.string().max(40).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const phone = normalizeKenyanPhone(data.phone);
    if (!phone) {
      return { ok: false as const, error: "Enter a valid Kenyan M-Pesa number." };
    }
    const settings = await getSettings();
    if (settings.maintenanceMode) {
      return {
        ok: false as const,
        error:
          settings.maintenanceMessage ||
          "We're doing scheduled maintenance right now. Please try again shortly.",
      };
    }
    const sql = await getSql();
    const pkgs = await sql<SqlRow>`
      select * from packages where id = ${data.packageId} and status = 'ACTIVE' limit 1
    `;
    const pkg = pkgs[0];
    if (!pkg) return { ok: false as const, error: "That package is no longer available." };

    // 2-device packages are a perk of a free account (see Settings). The
    // portal shows a sign-up prompt; this is the check that actually enforces it.
    if (settings.requireAccountMultiDevice && Number(pkg.max_devices) >= 2) {
      const member = await getSessionCustomer(data.token);
      if (!member?.registered) {
        return {
          ok: false as const,
          error: "Create a free account to use a 2-device package — or pick a 1-device package.",
          accountRequired: true as const,
        };
      }
    }

    // Paying from the link while the phone is not at the router: the package would start,
    // its clock would run, and nobody could use it. Block (default) or park it (queue).
    const gate = await awayGate(data.token);
    if (gate.blocked) {
      return { ok: false as const, notAtRouter: true as const, error: AWAY_BLOCK_MESSAGE };
    }
    const payAway = gate.away;

    const existing = await sql<{ id: string; status: string }>`
      select id, status from customers where phone = ${phone} limit 1
    `;
    let customerId = existing[0]?.id;
    if (existing[0]?.status === "BLOCKED") {
      return {
        ok: false as const,
        error: "This number is blocked. Please contact the hotspot operator.",
      };
    }
    // Which town this sale belongs to: the router's portal link (?site=slug)
    // wins, then the package's own site, then the main site. Customers and
    // payments carry it so reports can be filtered per town.
    let paySiteId = "site_default";
    if (data.site) {
      const hit = await sql<{ id: string }>`
        select id from sites where slug = ${data.site} and status = 'ACTIVE' limit 1
      `;
      if (hit[0]) paySiteId = hit[0].id;
      else if (pkg.site_id) paySiteId = String(pkg.site_id);
    } else if (pkg.site_id) {
      paySiteId = String(pkg.site_id);
    }

    // Closed for the night? Only the package kinds the operator allows can be bought.
    {
      const closedMsg = purchaseBlockedReason(await getHoursForSite(paySiteId), String(pkg.duration_kind ?? ""));
      if (closedMsg) return { ok: false as const, error: closedMsg, closed: true as const };
    }

    // A referral code only counts on a qualifying package (priced above the
    // configured minimum) — the UI hides the field below that price, but
    // this server check is the one that actually matters.
    const referralQualifies =
      settings.referralEnabled && Number(pkg.price) > Number(settings.referralMinPackagePrice);
    let referralApplied = false;
    let referrerToNotify: string | null = null;
    // Tell the customer up front if the code is wrong instead of silently
    // dropping it (they'd otherwise pay and never get the bonus).
    if (data.referralCode?.trim() && referralQualifies) {
      const known = await findCustomerByReferralCode(data.referralCode);
      if (!known) {
        return { ok: false as const, error: "That referral code doesn't exist. Check it or clear the field." };
      }
    }
    if (!customerId) {
      // Guests get NO referral code of their own (codes are issued at sign
      // up) and earn no loyalty points — but they can still USE a code.
      customerId = nid("cus");
      let referredBy: string | null = null;
      if (data.referralCode && referralQualifies) {
        const referrer = await findCustomerByReferralCode(data.referralCode);
        if (referrer) referredBy = referrer.id;
      }
      await sql`
        insert into customers (id, phone, device_token, status, referred_by_customer_id, site_id)
        values (${customerId}, ${phone}, ${data.token}, 'ACTIVE', ${referredBy}, ${paySiteId})
      `;
      if (referredBy) {
        referralApplied = true;
        referrerToNotify = referredBy;
      }
    } else {
      // An existing customer with no referrer yet and no paid history may
      // still attach a code to their first purchase.
      if (data.referralCode && referralQualifies) {
        const prior = await sql<{ n: number; ref: string | null; paid: boolean }>`
          select
            (select count(*)::int from payments where customer_id = ${customerId} and status = 'SUCCESS') as n,
            (select referred_by_customer_id from customers where id = ${customerId}) as ref,
            (select referral_bonus_paid from customers where id = ${customerId}) as paid
        `;
        if (Number(prior[0]?.n ?? 0) === 0 && !prior[0]?.ref && !prior[0]?.paid) {
          const referrer = await findCustomerByReferralCode(data.referralCode);
          if (referrer && referrer.id !== customerId) {
            await sql`
              update customers set referred_by_customer_id = ${referrer.id}, updated_at = now()
              where id = ${customerId}
            `;
            referralApplied = true;
            referrerToNotify = referrer.id;
          }
        }
      }
      await sql`
        update customers set device_token = ${data.token},
          site_id = coalesce(site_id, ${paySiteId}), updated_at = now()
        where id = ${customerId}
      `;
    }
    if (referrerToNotify) {
      await announceReferral(referrerToNotify, phone, null).catch(() => {});
    }

    // Double-tap guard: the same phone asking for the same package again while its first M-Pesa
    // prompt is still pending gets that payment back, instead of a second prompt that would be
    // paid twice and create a second package.
    const dup = await sql<SqlRow>`
      select id, checkout_request_id, merchant_request_id from payments
      where customer_id = ${customerId} and package_id = ${pkg.id} and phone = ${phone}
        and status = 'PENDING' and created_at > now() - interval '75 seconds'
      order by created_at desc limit 1
    `;
    if (dup[0]) {
      return {
        ok: true as const,
        paymentId: String(dup[0].id),
        customerId,
        checkoutRequestId: String(dup[0].checkout_request_id),
        amount: Number(pkg.price),
        packageName: String(pkg.name),
        phone,
        referralApplied,
        referralBonusMinutes: settings.welcomeBonusMinutes + settings.referralBonusMinutes,
      };
    }

    const paymentId = nid("pay");
    let stk;
    try {
      stk = await initiateStkPush({
        phone,
        amount: Number(pkg.price),
        accountRef: String(pkg.name).replace(/\s+/g, "").slice(0, 12),
        description: `TelNet ${pkg.name}`,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "Unknown M-Pesa error";
      // The real reason (missing Daraja keys, bad callback URL, etc.) is an
      // operator problem, not something a paying customer can act on — log
      // it for the operator and show the customer a plain, generic message.
      await logEvent("PAYMENT", `M-Pesa STK push failed: ${detail}`).catch(() => {});
      return {
        ok: false as const,
        error:
          "We couldn't start your M-Pesa payment right now. Please try again in a moment, or contact the hotspot operator if it keeps happening.",
      };
    }

    await sql`
      insert into payments (
        id, customer_id, package_id, checkout_request_id, merchant_request_id,
        phone, amount, status, activation_status, site_id, device_token, away
      ) values (
        ${paymentId}, ${customerId}, ${pkg.id}, ${stk.checkoutRequestId},
        ${stk.merchantRequestId}, ${phone}, ${pkg.price}, 'PENDING', 'NOT_ACTIVATED', ${paySiteId}, ${data.token}, ${payAway}
      )
    `;

    return {
      ok: true as const,
      paymentId,
      customerId,
      checkoutRequestId: stk.checkoutRequestId,
      amount: Number(pkg.price),
      packageName: String(pkg.name),
      phone,
      referralApplied,
      referralBonusMinutes: settings.welcomeBonusMinutes + settings.referralBonusMinutes,
    };
  });

export const getPaymentStatus = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ paymentId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const rows = await sql<SqlRow>`
      select p.*, pkg.name as package_name
      from payments p join packages pkg on pkg.id = p.package_id
      where p.id = ${data.paymentId}
      limit 1
    `;
    if (!rows[0]) return { ok: false as const, error: "Payment not found." };
    let payment = mapPayment(rows[0]);

    if (payment.status === "PENDING" && payment.checkoutRequestId) {
      try {
        const q = await queryStkStatus(payment.checkoutRequestId);
        const still =
          q.resultCode < 0 ||
          q.resultCode === 4999 ||
          /progress|processing|not found|under process/i.test(q.resultDesc);
        if (q.resultCode === 0 || q.resultCode === 1032 || (q.resultCode > 0 && !still)) {
          const { settlePendingByCheckout } = await import(
            "@/lib/services/callback.server"
          );
          await settlePendingByCheckout({
            checkoutRequestId: payment.checkoutRequestId,
            resultCode: q.resultCode,
            resultDesc: q.resultDesc,
            receipt: null,
          });
          const again = await sql<SqlRow>`
            select p.*, pkg.name as package_name
            from payments p join packages pkg on pkg.id = p.package_id
            where p.id = ${data.paymentId}
            limit 1
          `;
          if (again[0]) payment = mapPayment(again[0]);
        }
      } catch {
        // Keep PENDING until callback or next poll.
      }
    }

    let access: ActiveAccess = null;
    if (payment.status === "SUCCESS") {
      access = await findActiveForCustomer(payment.customerId);
    }
    return { ok: true as const, payment, access };
  });

export const recoverPackage = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        transactionId: z.string().min(6).max(20),
        token: z.string().min(8),
        phone: z.string().optional(),
        deviceInfo: z.string().optional(),
        site: z.string().max(40).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const sql = await getSql();
    const tx = data.transactionId.trim().toUpperCase();
    const phone = data.phone ? normalizeKenyanPhone(data.phone) : null;

    const recent = await sql<{ n: number }>`
      select count(*)::int as n from recovery_attempts
      where created_at > now() - interval '10 minutes'
        and (transaction_id = ${tx} or ${phone}::text is not null and phone = ${phone})
    `;
    if (Number(recent[0]?.n ?? 0) >= 8) {
      return {
        ok: false as const,
        error: "Too many recovery attempts. Please wait a few minutes and try again.",
      };
    }

    const rows = await sql<SqlRow>`
      select p.*, pkg.name as package_name, pkg.price
      from payments p
      join packages pkg on pkg.id = p.package_id
      where upper(p.mpesa_transaction_id) = ${tx}
      limit 1
    `;
    const row = rows[0];
    await sql`
      insert into recovery_attempts (id, phone, transaction_id, success)
      values (${nid("rec")}, ${phone}, ${tx}, ${Boolean(row) && String(row.status) === "SUCCESS"})
    `;

    if (!row) {
      return {
        ok: false as const,
        error: "Transaction not found. Please check your M-Pesa transaction ID and try again.",
      };
    }
    if (String(row.status) !== "SUCCESS") {
      return {
        ok: false as const,
        error: "This M-Pesa transaction was not successful.",
      };
    }

    const amountOk = Number(row.amount) === Number(row.price);
    if (!amountOk) {
      return { ok: false as const, error: "Transaction not found. Please check your M-Pesa transaction ID and try again." };
    }

    const packs = await sql<SqlRow>`
      select cp.*, pkg.name as package_name
      from customer_packages cp
      join packages pkg on pkg.id = cp.package_id
      where cp.payment_id = ${row.id}
      limit 1
    `;
    const pack = packs[0];
    // A package waiting for its phone has a placeholder end time that must not count as expiry.
    const waitingForPhone = Boolean(pack && String(pack.activation_status) === "AWAITING_DEVICE");
    if (
      pack &&
      !waitingForPhone &&
      (String(pack.status) === "EXPIRED" || new Date(String(pack.expiry_time)).getTime() <= Date.now())
    ) {
      return {
        ok: false as const,
        code: "expired" as const,
        error: "Your package has expired. Please purchase a new package.",
      };
    }

    const activation = await activateFromPayment(String(row.id), {
      token: data.token,
      info: data.deviceInfo,
      siteId: await siteIdFromSlug(data.site),
    });
    if (!activation.ok) {
      return activationFailure(activation, mapPayment(row));
    }
    return {
      ok: true as const,
      message: activation.queued
        ? activation.awaiting
          ? "Payment confirmed. Your package starts as soon as you are connected to the Wi-Fi: open the login page and tap Already paid? again."
          : "Payment confirmed. Your package is queued and will activate automatically when your current one ends."
        : "Payment confirmed. Reconnecting your package...",
      alreadyActive: Boolean(
        String(row.activation_status) === "ACTIVATED" &&
          pack &&
          String(pack.status) === "ACTIVE",
      ),
      activation,
      payment: mapPayment(row),
    };
  });

export const connectActive = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        token: z.string().min(8),
        phone: z.string().optional(),
        customerId: z.string().optional(),
        deviceInfo: z.string().optional(),
        site: z.string().max(40).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    await expireDuePackages();
    const sql = await getSql();
    const settings = await getSettings();
    const visitSiteId = await siteIdFromSlug(data.site);
    const internetUp = await isInternetUp(visitSiteId ?? "site_default");
    if (!internetUp) {
      return {
        ok: false as const,
        code: "offline" as const,
        error: "Internet connection is currently unavailable. Please try again later.",
      };
    }

    let customerId = data.customerId ?? null;
    if (!customerId && data.token) {
      const t = await sql<{ id: string }>`
        select id from customers where device_token = ${data.token} limit 1
      `;
      customerId = t[0]?.id ?? null;
    }
    if (!customerId && data.phone) {
      const p = normalizeKenyanPhone(data.phone);
      if (p) {
        const t = await sql<{ id: string }>`
          select id from customers where phone = ${p} limit 1
        `;
        customerId = t[0]?.id ?? null;
      }
    }
    if (!customerId) {
      return { ok: false as const, error: "No active package found on this device." };
    }

    // Knowing a phone number is not enough to take a free slot of someone's package: this device
    // must already belong to that customer. A second phone joins with a share code (Add a device).
    if (!(await deviceMayActFor(data.token, customerId))) {
      return {
        ok: false as const,
        code: "not_yours" as const,
        error:
          "This device is not linked to that package. Ask the owner for a share code and use Add a device, or use Already paid? with your M-Pesa code.",
      };
    }

    // Paid while away from the router: the phone is here now, so start that package.
    await startAwaitingForDevice(data.token, {
      customerId: (await isOwnerSession(data.token, customerId)) ? customerId : null,
      siteId: visitSiteId,
    }).catch(() => false);

    const result = await reconnectCustomer(customerId, {
      token: data.token,
      info: data.deviceInfo,
      siteId: visitSiteId,
    });
    if (!result.ok) {
      if (result.reason === "in_use") {
        return {
          ok: false as const,
          code: "in_use" as const,
          error: PACKAGE_IN_USE_MESSAGE,
        };
      }
      if (result.reason === "expired" || result.reason === "none") {
        return {
          ok: false as const,
          code: "expired" as const,
          error: "Your package has expired. Please purchase a new package.",
        };
      }
      if (result.reason === "blocked") {
        return {
          ok: false as const,
          error: "This number is blocked. Please contact the hotspot operator.",
        };
      }
      return {
        ok: false as const,
        code: "router" as const,
        error:
          "Payment received. Your package could not be activated yet. Please use 'Already Paid?' to reconnect.",
      };
    }
    if ("routerLoginFailed" in result && result.routerLoginFailed) {
      return {
        ok: false as const,
        code: "router" as const,
        error:
          "Your package is active, but we can't see this phone on the Wi-Fi yet. Join the Wi-Fi, then tap Connect to the Wi-Fi (or open any website to reach the login page).",
      };
    }
    return {
      ok: true as const,
      pack: result.pack,
      hotspotName: settings.hotspotName,
    };
  });

export const getAccount = createServerFn({ method: "POST" })
  .validator((data: unknown) => identitySchema.parse(data))
  .handler(async ({ data }) => {
    await expireDuePackages();
    const sql = await getSql();
    let access: ActiveAccess = null;
    let customerId: string | null = null;
    if (data.customerId) access = await findActiveForCustomer(data.customerId, data.token);
    if (!access && data.token) {
      const t = await sql<{ id: string }>`
        select id from customers where device_token = ${data.token} limit 1
      `;
      if (t[0]) {
        customerId = t[0].id;
        access = await findActiveForCustomer(t[0].id, data.token);
      }
    }
    if (!access && data.phone) {
      const p = normalizeKenyanPhone(data.phone);
      if (p) {
        const t = await sql<{ id: string }>`
          select id from customers where phone = ${p} limit 1
        `;
        if (t[0]) {
          customerId = t[0].id;
          access = await findActiveForCustomer(t[0].id, data.token);
        }
      }
    }
    customerId = access?.customer.id ?? customerId ?? data.customerId ?? null;
    const settings = await getSettings();
    const member = await getSessionCustomer(data.token);

    let devices: {
      ref: string;
      info: string | null;
      boundAt: string;
      isThisDevice: boolean;
      isPayer: boolean;
      canRemove: boolean;
      canLeave: boolean;
    }[] = [];
    let maxDevicesPerPackage = 1;
    let isOwner = false;
    if (access) {
      const rows = await sql<{ device_token: string; device_info: string | null; bound_at: string }>`
        select device_token, device_info, bound_at from customer_package_devices
        where customer_package_id = ${access.pack.id}
        order by bound_at asc
      `;
      const payer = await payerToken(access.pack.id);
      const signedInOwner = await isOwnerSession(data.token, access.customer.id);
      isOwner = signedInOwner || (payer !== null && payer === data.token);
      devices = rows.map((r) => {
        const isPayer = payer !== null && r.device_token === payer;
        const isThis = r.device_token === data.token;
        return {
          ref: deviceRef(access.pack.id, r.device_token),
          info: r.device_info,
          boundAt: r.bound_at,
          isThisDevice: isThis,
          isPayer,
          // The owner can remove any device except the one that paid; a joined device can leave by itself.
          canRemove: isOwner && !isPayer && !isThis,
          canLeave: isThis && !isOwner && !isPayer,
        };
      });
      maxDevicesPerPackage = await activePackageMaxDevices(access.customer.id);
    }
    // Queued packages are looked up by customer, NOT gated on an ACTIVE
    // package — the customer must see what they've paid for regardless.
    const queued = customerId ? await queuedPackages(customerId) : [];
    const queuedPayments = customerId
      ? await sql<{ n: number }>`
          select count(*)::int as n from payments
          where customer_id = ${customerId} and status = 'SUCCESS' and activation_status = 'QUEUED'
        `
      : [];
    return {
      access,
      hotspotName: settings.hotspotName,
      routerLoginUrl: settings.routerLoginUrl,
      currency: settings.currency,
      devices,
      isOwner,
      maxDevicesPerPackage,
      queued,
      queuedCount: Math.max(queued.length, Number(queuedPayments[0]?.n ?? 0)),
      member: member
        ? { id: member.id, phone: member.phone, registered: member.registered }
        : null,
      loyaltyEnabled: settings.loyaltyEnabled,
      referralEnabled: settings.referralEnabled,
    };
  });

/**
 * Everything on the Rewards page: loyalty points, referral code + stats and
 * unread alerts. Registered, signed-in customers only.
 */
export const getRewards = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ token: z.string().min(8).max(80) }).parse(data))
  .handler(async ({ data }) => {
    const settings = await getSettings();
    const base = {
      hotspotName: settings.hotspotName,
      currency: settings.currency,
      loyaltyEnabled: settings.loyaltyEnabled,
      referralEnabled: settings.referralEnabled,
      loyaltyPointsPerKes: settings.loyaltyPointsPerKes,
      referralBonusMinutes: settings.referralBonusMinutes,
      welcomeBonusMinutes: settings.welcomeBonusMinutes,
      referralMinPackagePrice: settings.referralMinPackagePrice,
    };
    const member = await getSessionCustomer(data.token);
    if (!member) return { ...base, state: "signed_out" as const };
    if (!member.registered) return { ...base, state: "guest" as const, phone: member.phone };

    const sql = await getSql();
    const c = (
      await sql<{
        loyalty_points: number;
        referral_code: string | null;
        bonus_minutes_balance: number;
      }>`
        select loyalty_points, referral_code, bonus_minutes_balance
        from customers where id = ${member.id} limit 1
      `
    )[0];
    const refs = (
      await sql<{ joined: number; paid: number; minutes: number }>`
        select
          (select count(*)::int from customers where referred_by_customer_id = ${member.id}) as joined,
          (select count(*)::int from customers where referred_by_customer_id = ${member.id} and referral_bonus_paid = true) as paid,
          coalesce((select sum(minutes) from customer_notices where customer_id = ${member.id} and kind = 'REFERRAL_BONUS'), 0)::int as minutes
      `
    )[0];
    const notices = await sql<{
      id: string;
      kind: string;
      message: string;
      minutes: number;
      created_at: string;
      seen_at: string | null;
    }>`
      select id, kind, message, minutes, created_at, seen_at from customer_notices
      where customer_id = ${member.id}
      order by created_at desc limit 20
    `;
    const rewards = settings.loyaltyEnabled
      ? (
          await sql<SqlRow>`
            select * from packages
            where status = 'ACTIVE' and points_cost is not null
            order by points_cost
          `
        ).map(mapPackage)
      : [];
    const ledger = await sql<{ id: string; delta: number; reason: string; created_at: string }>`
      select id, delta, reason, created_at from loyalty_ledger
      where customer_id = ${member.id} order by created_at desc limit 10
    `;
    return {
      ...base,
      state: "member" as const,
      customerId: member.id,
      phone: member.phone,
      points: Number(c?.loyalty_points ?? 0),
      referralCode: c?.referral_code ?? null,
      bankedMinutes: Number(c?.bonus_minutes_balance ?? 0),
      referralStats: {
        joined: Number(refs?.joined ?? 0),
        paid: Number(refs?.paid ?? 0),
        minutesEarned: Number(refs?.minutes ?? 0),
      },
      notices: notices.map((n) => ({
        id: String(n.id),
        kind: String(n.kind),
        message: String(n.message),
        minutes: Number(n.minutes),
        createdAt: iso(n.created_at),
        unread: !n.seen_at,
      })),
      rewards,
      ledger: ledger.map((l) => ({
        id: String(l.id),
        delta: Number(l.delta),
        reason: String(l.reason),
        createdAt: iso(l.created_at),
      })),
    };
  });

export const dismissNotices = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({ token: z.string().min(8).max(80), ids: z.array(z.string()).max(50).optional() })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const member = await getSessionCustomer(data.token);
    if (!member) return { ok: false as const };
    const sql = await getSql();
    if (data.ids && data.ids.length > 0) {
      await sql`
        update customer_notices set seen_at = now()
        where customer_id = ${member.id} and id = any(${data.ids}) and seen_at is null
      `;
    } else {
      await sql`
        update customer_notices set seen_at = now()
        where customer_id = ${member.id} and seen_at is null
      `;
    }
    return { ok: true as const };
  });

export const signUp = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        phone: z.string().min(9).max(20),
        secret: z.string().min(4).max(64),
        token: z.string().min(8).max(80),
        referralCode: z.string().max(20).optional(),
        claimTransactionId: z.string().max(20).optional(),
        smsCode: z.string().max(10).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => signUpCustomer(data));

export const signIn = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        phone: z.string().min(9).max(20),
        secret: z.string().min(1).max(64),
        token: z.string().min(8).max(80),
      })
      .parse(data),
  )
  .handler(async ({ data }) => signInCustomer(data));

export const resetPasswordWithReceipt = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        phone: z.string().min(9).max(20),
        transactionId: z.string().min(6).max(20),
        next: z.string().min(4).max(64),
        token: z.string().min(8).max(80),
      })
      .parse(data),
  )
  .handler(async ({ data }) => resetCustomerSecretWithReceipt(data));

export const requestSignupOtpFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ phone: z.string().min(9).max(20) }).parse(data))
  .handler(async ({ data }) => requestSignupOtp(data));

export const getResetOptionsFn = createServerFn({ method: "GET" }).handler(async () => getResetOptions());

export const requestResetOtpFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ phone: z.string().min(9).max(20) }).parse(data))
  .handler(async ({ data }) => requestResetOtp(data));

export const resetPasswordWithOtp = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        phone: z.string().min(9).max(20),
        code: z.string().min(4).max(10),
        next: z.string().min(4).max(64),
        token: z.string().min(8).max(80),
      })
      .parse(data),
  )
  .handler(async ({ data }) => resetCustomerSecretWithOtp(data));

export const changePin = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        token: z.string().min(8).max(80),
        current: z.string().min(1).max(64),
        next: z.string().min(4).max(64),
      })
      .parse(data),
  )
  .handler(async ({ data }) => changeCustomerSecret(data));

export const signOut = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ token: z.string().min(8).max(80) }).parse(data))
  .handler(async ({ data }) => {
    await signOutDevice(data.token);
    return { ok: true as const };
  });

const SHARE_CODE_TTL_MIN = 10;
async function hashShareCode(customerId: string, code: string) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(`${customerId}:${code}`).digest("hex");
}

/**
 * Phone A's side of "share my package": a one-time 6-digit code, made on a device that is
 * already part of the package (never from a phone number alone), valid for a few minutes.
 * The other phone must enter the number AND this code, so guessing a number is not enough.
 */
export const createShareCode = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ token: z.string().min(8).max(80) }).parse(data))
  .handler(async ({ data }) => {
    const sql = await getSql();
    // Sharing hands out a slot of the owner's paid package, so the owner must be signed in to
    // their account on this phone (a joined phone cannot hand the slot on).
    const member = await getSessionCustomer(data.token);
    if (!member?.registered) {
      return {
        ok: false as const,
        signInRequired: true as const,
        error: "Sign in to your account on this phone to share your package.",
      };
    }
    // Only a device that is bound to (or is the registered device of) a RUNNING package may share it.
    const owner = await sql<{ customer_id: string; cp_id: string; max_devices: number; bound: number }>`
      select cp.customer_id, cp.id as cp_id, pkg.max_devices,
             (select count(*)::int from customer_package_devices d where d.customer_package_id = cp.id) as bound
      from customer_packages cp
      join packages pkg on pkg.id = cp.package_id
      join customers c on c.id = cp.customer_id
      where cp.status = 'ACTIVE' and cp.expiry_time > now()
        and cp.customer_id = ${member.id}
        and (
          c.device_token = ${data.token}
          or cp.id in (select customer_package_id from customer_package_devices where device_token = ${data.token})
        )
      order by cp.expiry_time desc
      limit 1
    `;
    const o = owner[0];
    if (!o) return { ok: false as const, error: "This device has no running package to share." };
    if (Number(o.max_devices) < 2) {
      return { ok: false as const, error: "This package is for one device only. A 2-device package is needed to share." };
    }
    if (Number(o.bound) >= Number(o.max_devices)) {
      return { ok: false as const, error: "All device slots of this package are in use." };
    }
    const { randomInt } = await import("node:crypto");
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    await sql`delete from device_share_codes where customer_id = ${o.customer_id} and used_at is null`;
    await sql`
      insert into device_share_codes (id, customer_id, customer_package_id, code_hash, expires_at)
      values (${nid("shc")}, ${o.customer_id}, ${o.cp_id}, ${await hashShareCode(o.customer_id, code)},
              now() + (${SHARE_CODE_TTL_MIN} * interval '1 minute'))
    `;
    return { ok: true as const, code, minutes: SHARE_CODE_TTL_MIN };
  });

/**
 * Phone B's side of "share my package": enter the host's phone number and,
 * if their package has a free device slot, this device joins it. Reuses
 * reconnectCustomer, which is the exact same path a host's own second
 * device takes, so activation/limits/logging all stay consistent.
 */
export const joinHostPackage = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        hostPhone: z.string().min(9).max(15),
        code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from the host's phone."),
        token: z.string().min(8),
        deviceInfo: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const p = normalizeKenyanPhone(data.hostPhone);
    if (!p) {
      return { ok: false as const, error: "Enter a valid phone number." };
    }
    const sql = await getSql();
    // Brute-force limits: a 6-digit code only protects the host if guesses are scarce.
    const tokenKey = `JOIN:${data.token.slice(0, 24)}`;
    const failed = await sql<{ by_phone: number; by_device: number }>`
      select
        count(*) filter (where phone = ${p} and transaction_id like 'JOIN%')::int as by_phone,
        count(*) filter (where transaction_id = ${tokenKey})::int as by_device
      from recovery_attempts
      where success = false and created_at > now() - interval '15 minutes'
    `;
    if (Number(failed[0]?.by_phone ?? 0) >= 5 || Number(failed[0]?.by_device ?? 0) >= 8) {
      return { ok: false as const, error: "Too many wrong codes. Please wait 15 minutes and try again." };
    }
    const host = await sql<{ id: string; status: string }>`
      select id, status from customers where phone = ${p} limit 1
    `;
    const wrong = "That number or code is wrong, or the code has expired. Ask the host to open Your package → Share code on their phone.";
    let codeOk = false;
    let sharedPackageId: string | null = null;
    if (host[0]) {
      const rows = await sql<{ id: string; code_hash: string; customer_package_id: string | null }>`
        select id, code_hash, customer_package_id from device_share_codes
        where customer_id = ${host[0].id} and used_at is null and expires_at > now()
        order by created_at desc limit 1
      `;
      const want = rows[0]?.code_hash;
      const got = await hashShareCode(host[0].id, data.code);
      const { timingSafeEqual } = await import("node:crypto");
      codeOk = Boolean(want) && want.length === got.length && timingSafeEqual(Buffer.from(want), Buffer.from(got));
      if (codeOk) {
        // one use only, claimed atomically so two phones cannot share one code
        const claimed = await sql<{ id: string }>`
          update device_share_codes set used_at = now() where id = ${rows[0].id} and used_at is null returning id
        `;
        codeOk = claimed.length > 0;
        if (codeOk) sharedPackageId = rows[0].customer_package_id;
      }
    }
    await sql`
      insert into recovery_attempts (id, phone, transaction_id, success)
      values (${nid("rec")}, ${p}, ${tokenKey}, ${codeOk})
    `;
    if (!host[0] || !codeOk) return { ok: false as const, error: wrong };
    if (host[0].status === "BLOCKED") {
      return { ok: false as const, error: "That account is blocked." };
    }
    const hostId = host[0].id;

    // A device that already has its OWN package running shouldn't silently
    // swap onto someone else's — tell the user plainly instead.
    const own = await sql<{ package_name: string; expiry_time: string }>`
      select pkg.name as package_name, cp.expiry_time
      from customer_packages cp
      join packages pkg on pkg.id = cp.package_id
      where cp.status = 'ACTIVE' and cp.expiry_time > now()
        and cp.customer_id <> ${hostId}
        and (
          cp.customer_id in (select id from customers where device_token = ${data.token})
          or cp.id in (select customer_package_id from customer_package_devices where device_token = ${data.token})
        )
      order by cp.expiry_time desc
      limit 1
    `;
    if (own[0]) {
      return {
        ok: false as const,
        error: `This device already has ${String(own[0].package_name)} running. Let it finish first — or buy another package and it will queue behind it.`,
      };
    }

    const hostActive = await sql<{ id: string }>`
      select id from customer_packages
      where customer_id = ${hostId} and status = 'ACTIVE' and expiry_time > now()
      limit 1
    `;
    if (!hostActive[0]) {
      const hostQueued = await sql<{ id: string }>`
        select id from customer_packages
        where customer_id = ${hostId} and status = 'QUEUED' limit 1
      `;
      return {
        ok: false as const,
        error: hostQueued[0]
          ? "That number's package hasn't started yet, so there's nothing to join. Try again once it's running."
          : "That number has no active package to share.",
      };
    }

    const res = await reconnectCustomer(hostId, {
      token: data.token,
      info: data.deviceInfo ?? "Captive portal (joined)",
      packageId: sharedPackageId,
    });
    if (!res.ok) {
      const message =
        res.reason === "in_use"
          ? PACKAGE_IN_USE_MESSAGE
          : res.reason === "blocked"
            ? "That account is blocked."
            : res.reason === "expired"
              ? "That package has expired."
              : res.reason === "none"
                ? "That number has no active package to share."
                : "The package is active, but we couldn't connect this device right now. Please try again in a moment.";
      return { ok: false as const, error: message };
    }
    return { ok: true as const, pack: res.pack };
  });


/** Look up the running package this device belongs to, for the device-management calls. */
async function packageForDevice(token: string) {
  const sql = await getSql();
  const rows = await sql<{ id: string; customer_id: string; mikrotik_username: string | null }>`
    select cp.id, cp.customer_id, cp.mikrotik_username
    from customer_packages cp
    left join customers c on c.id = cp.customer_id
    where cp.status = 'ACTIVE' and cp.expiry_time > now()
      and (
        cp.id in (select customer_package_id from customer_package_devices where device_token = ${token})
        or c.device_token = ${token}
      )
    order by cp.expiry_time desc
    limit 1
  `;
  return rows[0] ?? null;
}

/**
 * Owner removes another phone from the package. Frees its slot and switches only that
 * phone off. The owner = the signed-in account, or the phone that paid; the payer phone
 * itself cannot be removed (the package is its own).
 */
export const removeDevice = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ token: z.string().min(8).max(200), ref: z.string().min(8).max(40) }).parse(data),
  )
  .handler(async ({ data }) => {
    const pack = await packageForDevice(data.token);
    if (!pack) return { ok: false as const, error: "No running package found on this device." };
    if (!(await canManageDevices(data.token, pack))) {
      return { ok: false as const, error: "Only the owner of this package can remove devices." };
    }
    const sql = await getSql();
    const bound = await sql<{ device_token: string }>`
      select device_token from customer_package_devices where customer_package_id = ${pack.id}
    `;
    const target = bound.find((r) => deviceRef(pack.id, r.device_token) === data.ref);
    if (!target) return { ok: false as const, error: "That device is no longer on this package." };
    const payer = await payerToken(pack.id);
    if (target.device_token === data.token || (payer !== null && target.device_token === payer)) {
      return { ok: false as const, error: "You cannot remove the device that owns this package." };
    }
    const { kicked } = await removeBoundDevice(pack, target.device_token, "owner");
    return { ok: true as const, kicked };
  });

/** A joined phone leaves the shared package by itself, freeing the slot. The owner phone cannot leave. */
export const leavePackage = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ token: z.string().min(8).max(200) }).parse(data))
  .handler(async ({ data }) => {
    const sql = await getSql();
    const rows = await sql<{ id: string; customer_id: string; mikrotik_username: string | null }>`
      select cp.id, cp.customer_id, cp.mikrotik_username
      from customer_packages cp
      join customer_package_devices d on d.customer_package_id = cp.id
      where d.device_token = ${data.token} and cp.status = 'ACTIVE' and cp.expiry_time > now()
      order by cp.expiry_time desc
      limit 1
    `;
    const pack = rows[0];
    if (!pack) return { ok: false as const, error: "This device is not on a running package." };
    const payer = await payerToken(pack.id);
    if ((payer !== null && payer === data.token) || (await isOwnerSession(data.token, pack.customer_id))) {
      return {
        ok: false as const,
        error: "This is the owner's device. Remove the other devices first, or let the package finish.",
      };
    }
    const { kicked } = await removeBoundDevice(pack, data.token, "self");
    return { ok: true as const, kicked };
  });


export const redeemVoucherPortal = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        code: z.string().min(4).max(32),
        phone: z.string().min(9).max(15),
        deviceToken: z.string().optional(),
        site: z.string().max(40).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    try {
      const res = await redeemVoucher({
        code: data.code,
        phone: data.phone,
        deviceToken: data.deviceToken,
        visitSiteId: await siteIdFromSlug(data.site),
      });
      return { ok: true as const, ...res };
    } catch (e) {
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : "Redeem failed",
      };
    }
  });

export const redeemPoints = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        packageId: z.string(),
        token: z.string().min(8).max(80),
        site: z.string().max(40).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const settings = await getSettings();
    if (!settings.loyaltyEnabled) {
      return { ok: false as const, error: "Loyalty points aren't enabled right now." };
    }
    // The account comes from the signed-in device, never from the request.
    const member = await getSessionCustomer(data.token);
    if (!member?.registered) {
      return { ok: false as const, error: "Sign in to redeem your loyalty points." };
    }
    return redeemPointsForPackage({
      customerId: member.id,
      packageId: data.packageId,
      deviceToken: data.token,
      visitSiteId: await siteIdFromSlug(data.site),
    });
  });


/**
 * Omada / Ruijie: the vendor's portal redirect (MAC, AP, SSID ...) was stored under
 * an id that travels in the portal URL (?hwc=). Tie it to this browser so the
 * payment can later switch exactly this device on. No-op for MikroTik.
 */
export const bindHardwareClient = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ token: z.string().min(8).max(200), ctx: z.string().min(8).max(80) }).parse(data),
  )
  .handler(async ({ data }) => {
    // MikroTik: the phone's MAC becomes its identity (stable across popup sessions).
    const token = await adoptMacIdentity(data.ctx, data.token).catch(() => null);
    if (token) {
      await startAwaitingForDevice(token).catch(() => false);
      return { ok: true, token };
    }
    const bound = await bindClientContext(data.ctx, data.token);
    if (bound) await startAwaitingForDevice(data.token).catch(() => false);
    return { ok: bound, token: null as string | null };
  });

/**
 * Ruijie only: after payment the browser must visit the gateway's auth URL once
 * to finish login. Returns that URL (once) or null.
 */
export const getHardwareHandoff = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ token: z.string().min(8).max(200) }).parse(data))
  .handler(async ({ data }) => ({ url: await takeHandoffUrl(data.token) }));


// --- Airtime / data shop ---------------------------------------------------------------------------

export const getShopInfo = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ site: z.string().max(40).optional() }).parse(data ?? {}))
  .handler(async ({ data }) => {
    const { shopPublicInfo } = await import("@/lib/services/shop.server");
    return shopPublicInfo(await siteIdFromSlug(data.site));
  });

export const createShopOrder = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z
      .object({
        productId: z.string().min(1).max(80),
        amount: z.number().int().min(1).max(100000).optional(),
        payerPhone: z.string().min(9).max(20),
        targetPhone: z.string().max(20).optional(),
        site: z.string().max(40).optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { createOrder } = await import("@/lib/services/shop.server");
    return createOrder({
      productId: data.productId,
      amount: data.amount,
      payerPhone: data.payerPhone,
      targetPhone: data.targetPhone,
      siteId: await siteIdFromSlug(data.site),
    });
  });

export const getShopOrderStatus = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ orderId: z.string().min(1).max(80) }).parse(data))
  .handler(async ({ data }) => {
    const { getOrderStatus } = await import("@/lib/services/shop.server");
    const o = await getOrderStatus(data.orderId);
    if (!o) return { ok: false as const };
    // Only what the customer needs: never other people's numbers beyond the masked recipient.
    return {
      ok: true as const,
      order: {
        id: o.id,
        productName: o.productName,
        kind: o.kind,
        amount: o.amount,
        status: o.status,
        fulfilStatus: o.fulfilStatus,
        targetPhone: o.targetPhone.slice(0, 5) + "•••" + o.targetPhone.slice(-3),
        receipt: o.receipt,
      },
    };
  });
