import { countOnlineAtSite, getEffectiveCapacity } from "@/lib/services/capacity.server";
import { getSql } from "@/lib/db";
import { nid, asNumber } from "@/lib/utils";
import {
  MikroTikError,
  createAndActivateUser,
  getRouterCredentialsById,
  randomPassword,
  rosList,
  usernameForPhone,
} from "./mikrotik.server";
import {
  HardwareError,
  authorizeOnHardware,
  disableUser,
  disconnectUser,
  hasFreshContext,
  linkAuthorization,
  loginMikrotikClient,
  resolveHardwareTarget,
} from "./hardware";
import { fmtLocal } from "./clock.server";
import { singleFlight, type FlightMap } from "./single-flight";
import { routerTiming, type RouterTiming } from "./router-timing";
import { expireDuePackages } from "./expiry.server";
import { awardLoyaltyForPayment, applyReferralMinutesForPayment } from "./loyalty.server";
import { getSettings, logEvent } from "./settings.server";
import { mapCustomerPackage, type SqlRow } from "./rows.server";
import type { CustomerPackage } from "@/lib/types";

function nextIp() {
  const host = 2 + Math.floor(Math.random() * 250);
  return `10.10.0.${host}`;
}

function randomMac() {
  const b = () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0");
  return `02:${b()}:${b()}:${b()}:${b()}:${b()}`.toUpperCase();
}

function timingNote(startedAt: number) {
  const t: RouterTiming | undefined = routerTiming.getStore();
  const total = ((Date.now() - startedAt) / 1000).toFixed(1);
  return t
    ? `Activation took ${total}s (router: ${t.calls} calls, ${(t.ms / 1000).toFixed(1)}s of waiting).`
    : `Activation took ${total}s.`;
}

type ActivateResult = Awaited<ReturnType<typeof activateFromPaymentUnlocked>>;
const activationFlights: FlightMap<ActivateResult> = new Map();

/**
 * One activation per payment at a time. The M-Pesa callback, the portal's status poll, the
 * 1-minute retry tick and "Already paid?" can all arrive within seconds of each other; run in
 * parallel they created duplicate customer_packages rows (the doubled packages in the customer
 * view) and one run's router login deleted the other's session, leaving a phone connected
 * with no internet. Promotions come from the expiry sweep, which can itself be running inside
 * an activation, so they bypass the queue (as before).
 */
export function activateFromPayment(
  paymentId: string,
  device?: Parameters<typeof activateFromPaymentUnlocked>[1],
  opts?: { promote?: boolean },
): Promise<ActivateResult> {
  if (opts?.promote) {
    return routerTiming.run({ calls: 0, ms: 0 }, () => activateFromPaymentUnlocked(paymentId, device, opts));
  }
  return singleFlight(activationFlights, paymentId, device?.token ?? "", () =>
    routerTiming.run({ calls: 0, ms: 0 }, () => activateFromPaymentUnlocked(paymentId, device, opts)),
  );
}

async function activateFromPaymentUnlocked(
  paymentId: string,
  device?: {
    token?: string | null;
    info?: string | null;
    /**
     * The site the person is at RIGHT NOW (from the portal link). Decides Omada/Ruijie vs MikroTik for
     * reconnects, "Already paid?", vouchers and points, whose payment/voucher may belong to another site.
     */
    siteId?: string | null;
  },
  /**
   * promote: set only by the expiry job when it is this queued package's
   * turn. Every other caller (retry buttons, "Already paid?", reconnects)
   * re-running a payment whose package is still QUEUED must NOT start it
   * early — that used to skip the queue and overlap the running package.
   */
  opts?: { promote?: boolean },
): Promise<
  | { ok: true; pack: CustomerPackage; queued?: boolean; awaiting?: boolean; routerLoginFailed?: boolean }
  | { ok: false; reason: string }
> {
  const startedAt = Date.now();
  await expireDuePackages();
  const sql = await getSql();

  const pays = await sql<SqlRow>`
    select p.*, pkg.name as package_name, pkg.duration_minutes, pkg.download_kbps,
           pkg.upload_kbps, pkg.data_limit_mb, pkg.category as package_category,
           pkg.max_devices as package_max_devices,
           c.phone as customer_phone, c.status as customer_status
    from payments p
    join packages pkg on pkg.id = p.package_id
    join customers c on c.id = p.customer_id
    where p.id = ${paymentId}
    limit 1
  `;
  const pay = pays[0];
  if (!pay) return { ok: false, reason: "not_found" };
  if (String(pay.status) !== "SUCCESS") return { ok: false, reason: "unpaid" };
  if (String(pay.customer_status) === "BLOCKED") {
    return { ok: false, reason: "blocked" };
  }
  // The M-Pesa callback and background retries carry no device: use the one that paid.
  if (!device?.token && pay.device_token) {
    device = { ...(device ?? {}), token: String(pay.device_token) };
  }

  // Points are earned for the payment itself, independent of whether the
  // router activation below succeeds (that can fail and retry later —
  // the customer still paid). awardLoyaltyForPayment() is idempotent per
  // payment id, so this is safe however many times activation is retried
  // or a package is later auto-resumed.
  // Loyalty and referral are independent DB jobs: run them together, not one after the other.
  let referralExtraMinutes = 0;
  const [, referral] = await Promise.all([
    awardLoyaltyForPayment(paymentId).catch((err) => {
      console.error("[loyalty] award failed for payment", paymentId, err);
    }),
    applyReferralMinutesForPayment(paymentId).catch((err) => {
      console.error("[referral] minutes award failed for payment", paymentId, err);
      return 0;
    }),
  ]);
  referralExtraMinutes = Number(referral ?? 0) || 0;

  const existing = await sql<SqlRow>`
    select cp.*, pkg.name as package_name
    from customer_packages cp
    join packages pkg on pkg.id = cp.package_id
    where cp.payment_id = ${paymentId}
    limit 1
  `;

  let packRow = existing[0];
  // The bonus is claimed once, on the first call. If that call ended before the package row
  // existed (router down, capacity), the retry creates the package here: use what was stored.
  if (!packRow && referralExtraMinutes === 0) {
    referralExtraMinutes = Number(pay.referral_minutes_applied ?? 0) || 0;
  }
  const settings = await getSettings();
  const isQueuedRow = Boolean(packRow && String(packRow.status) === "QUEUED");

  // Paid from the link while the phone was away from the router ("queue" mode): the package
  // waits, with its clock stopped, until this payment is presented from a phone that has
  // just reached the router (portal visit, auto-reconnect or "Already paid?").
  const awayPay = settings.payAwayMode === "queue" && Boolean(pay.away);
  const awaitingRow = Boolean(packRow && String(packRow.activation_status) === "AWAITING_DEVICE");
  let presentHere = true;
  if (awayPay && (awaitingRow || !packRow || opts?.promote)) {
    presentHere = await hasFreshContext(device?.token);
  }
  const promoting = Boolean(opts?.promote) || (awaitingRow && presentHere);
  if (packRow && isQueuedRow && !promoting) {
    return { ok: true, pack: mapCustomerPackage(packRow), queued: true, awaiting: awaitingRow };
  }
  if (packRow && isQueuedRow && awayPay && !presentHere) {
    // The queue says it is this package's turn but the phone is not here: keep waiting.
    await sql`
      update customer_packages set activation_status = 'AWAITING_DEVICE', updated_at = now()
      where id = ${packRow.id}
    `;
    return { ok: true, pack: mapCustomerPackage(packRow), queued: true, awaiting: true };
  }

  // A row that already exists (resume, retry, promotion, or an operator's
  // "change package") is governed by ITS package, not the package the
  // payment was originally for — otherwise a reconnect would silently undo
  // a speed change.
  let effDownload = Number(pay.download_kbps);
  let effUpload = Number(pay.upload_kbps);
  let effCategory = String(pay.package_category ?? "STANDARD");
  let effMaxDevices = Number(pay.package_max_devices);
  if (packRow && String(packRow.package_id) !== String(pay.package_id)) {
    const cur = (
      await sql<SqlRow>`
        select download_kbps, upload_kbps, category, max_devices
        from packages where id = ${packRow.package_id} limit 1
      `
    )[0];
    if (cur) {
      effDownload = Number(cur.download_kbps);
      effUpload = Number(cur.upload_kbps);
      effCategory = String(cur.category ?? "STANDARD");
      effMaxDevices = Number(cur.max_devices);
    }
  }
  const packageMaxDevices = effMaxDevices >= 2 ? 2 : 1;
  const durationMin = Number(pay.duration_minutes) + referralExtraMinutes;

  // Stacking: this is a brand-new payment (no customer_package row for it
  // yet) — if the customer already has paid-for time running (an ACTIVE or
  // already-QUEUED package that hasn't expired), don't cut that short.
  // Queue this one to start the moment the last bit of coverage runs out,
  // instead of disconnecting the live session and replacing it. A resume,
  // retry or router-recovery re-run of this SAME payment (packRow present)
  // always falls through below — that's what promotes a queued package to
  // ACTIVE once expireDuePackages() decides it's its turn.
  // Parallel mode: a package bought from a DIFFERENT device than the one(s) running gets its own
  // hotspot login and starts now; a repeat purchase from the SAME device queues behind that
  // device's own login. Without a known device the old rule (queue behind everything) applies.
  let chosenUsername: string | null = null;
  let queueScopeUsernames: string[] | null = null;
  if (!packRow && settings.parallelDevicePackages && settings.oneDevicePerPackage && device?.token) {
    const running = await sql<{ mikrotik_username: string | null; mine: boolean; has_bound: boolean }>`
      select cp.mikrotik_username,
             exists (select 1 from customer_package_devices d
                     where d.customer_package_id = cp.id and d.device_token = ${device.token}) as mine,
             exists (select 1 from customer_package_devices d
                     where d.customer_package_id = cp.id) as has_bound
      from customer_packages cp
      where cp.customer_id = ${pay.customer_id}
        and cp.status in ('ACTIVE', 'QUEUED') and cp.expiry_time > now()
    `;
    const mine = running.filter((r) => r.mine && r.mikrotik_username);
    if (mine.length > 0) {
      queueScopeUsernames = [...new Set(mine.map((r) => String(r.mikrotik_username)))];
      chosenUsername = queueScopeUsernames[0];
    } else if (running.some((r) => r.has_bound)) {
      // Some package is held by another device and none is held by this one: this device gets its own login now.
      // (Previously EVERY running row had to be bound, so one queued/failed/unbound row made the purchase queue
      // behind the first device and the new device was then blocked as "in use".)
      const taken = new Set(running.map((r) => String(r.mikrotik_username ?? "")));
      const base = usernameForPhone(String(pay.phone));
      let n = 2;
      while (taken.has(`${base}d${n}`)) n += 1;
      chosenUsername = `${base}d${n}`;
      await logEvent(
        "PARALLEL",
        `${String(pay.phone)} paid from another device while a package is running: starting ${String(pay.package_name)} now on its own login ${chosenUsername}.`,
      ).catch(() => {});
    }
  }

  if (!packRow && !(chosenUsername && !queueScopeUsernames)) {
    const coverage = await sql<{ latest: string | null }>`
      select max(expiry_time) as latest from customer_packages
      where customer_id = ${pay.customer_id}
        and status in ('ACTIVE', 'QUEUED')
        and expiry_time > now()
        and (${queueScopeUsernames}::text[] is null or mikrotik_username = any(${queueScopeUsernames}::text[]))
    `;
    const latestCovered = coverage[0]?.latest ? new Date(String(coverage[0].latest)) : null;
    if (latestCovered && latestCovered.getTime() > Date.now()) {
      const qStart = latestCovered;
      const qExpiry = new Date(qStart.getTime() + durationMin * 60_000);
      const id = nid("cp");
      const username = chosenUsername ?? usernameForPhone(String(pay.phone));
      await sql`
        insert into customer_packages (
          id, customer_id, package_id, payment_id, start_time, expiry_time,
          speed_limit_kbps, data_limit_mb, status, activation_status, mikrotik_username
        ) values (
          ${id}, ${pay.customer_id}, ${pay.package_id}, ${paymentId},
          ${qStart.toISOString()}, ${qExpiry.toISOString()},
          ${pay.download_kbps}, ${pay.data_limit_mb},
          'QUEUED', 'QUEUED', ${username}
        )
      `;
      await sql`
        update payments set activation_status = 'QUEUED', updated_at = now()
        where id = ${paymentId}
      `;
      await logEvent(
        "QUEUED",
        `Package ${String(pay.package_name)} queued for ${String(pay.phone)} — will start automatically at ${fmtLocal(qStart)} when the current package ends.`,
      );
      const queuedRow = (
        await sql<SqlRow>`
          select cp.*, pkg.name as package_name
          from customer_packages cp join packages pkg on pkg.id = cp.package_id
          where cp.id = ${id}
        `
      )[0];
      return { ok: true, pack: mapCustomerPackage(queuedRow), queued: true };
    }
  }

  if (awayPay && !packRow && !presentHere) {
    const id = nid("cp");
    const pStart = new Date();
    const pExpiry = new Date(pStart.getTime() + durationMin * 60_000);
    await sql`
      insert into customer_packages (
        id, customer_id, package_id, payment_id, start_time, expiry_time,
        speed_limit_kbps, data_limit_mb, status, activation_status, mikrotik_username
      ) values (
        ${id}, ${pay.customer_id}, ${pay.package_id}, ${paymentId},
        ${pStart.toISOString()}, ${pExpiry.toISOString()},
        ${pay.download_kbps}, ${pay.data_limit_mb},
        'QUEUED', 'AWAITING_DEVICE', ${chosenUsername ?? usernameForPhone(String(pay.phone))}
      )
    `;
    await sql`
      update payments set activation_status = 'QUEUED', updated_at = now()
      where id = ${paymentId}
    `;
    await logEvent(
      "AWAY_QUEUED",
      `${String(pay.phone)} paid for ${String(pay.package_name)} while away from the router. Clock not started: it starts when the phone reaches the router.`,
    ).catch(() => {});
    const parked = (
      await sql<SqlRow>`
        select cp.*, pkg.name as package_name
        from customer_packages cp join packages pkg on pkg.id = cp.package_id
        where cp.id = ${id}
      `
    )[0];
    return { ok: true, pack: mapCustomerPackage(parked), queued: true, awaiting: true };
  }

  // Promotion: the queued package's clock starts NOW (not at the moment it
  // was scheduled to), so any gap — router down, late job — never eats the
  // time the customer paid for.
  const start = !packRow || isQueuedRow ? new Date() : new Date(String(packRow.start_time));
  let expiry = packRow
    ? isQueuedRow
      ? new Date(
          start.getTime() +
            (new Date(String(packRow.expiry_time)).getTime() -
              new Date(String(packRow.start_time)).getTime()),
        )
      : new Date(String(packRow.expiry_time))
    : new Date(start.getTime() + durationMin * 60_000);

  // Minutes banked for this customer while this package waited in the queue (e.g. a friend they
  // referred bought a package) are added when it starts, not left until their next purchase.
  if (packRow && isQueuedRow) {
    const banked = await sql<{ bonus_minutes_balance: number }>`
      update customers set bonus_minutes_balance = 0, updated_at = now()
      where id = ${pay.customer_id} and bonus_minutes_balance > 0
      returning bonus_minutes_balance
    `;
    const extra = Math.max(0, Math.floor(Number(banked[0]?.bonus_minutes_balance ?? 0)));
    if (extra > 0) {
      expiry = new Date(expiry.getTime() + extra * 60_000);
      await logEvent("REFERRAL", `${extra} banked bonus minutes added to ${String(pay.phone)}'s queued package as it started.`).catch(() => {});
    }
  }

  if (expiry.getTime() <= Date.now()) {
    if (packRow) {
      await sql`
        update customer_packages
        set status = 'EXPIRED', activation_status = 'EXPIRED', updated_at = now()
        where id = ${packRow.id}
      `;
    }
    return { ok: false, reason: "expired" };
  }

  const boundTokens = packRow
    ? (
        await sql<{ device_token: string }>`
          select device_token from customer_package_devices where customer_package_id = ${packRow.id}
        `
      ).map((r) => r.device_token)
    : [];
  const deviceAlreadyBound = Boolean(device?.token && boundTokens.includes(device.token));

  if (
    settings.oneDevicePerPackage &&
    device?.token &&
    !deviceAlreadyBound &&
    boundTokens.length >= packageMaxDevices
  ) {
    await logEvent(
      "DEVICE_BLOCK",
      `Package for ${String(pay.phone)} refused — already in use on ${boundTokens.length} device(s) (limit ${packageMaxDevices}).`,
    );
    return { ok: false, reason: "in_use" };
  }

  const username =
    (packRow?.mikrotik_username as string | null) ||
    chosenUsername ||
    usernameForPhone(String(pay.phone));
  const password = randomPassword();
  const remaining = Math.max(
    60,
    Math.floor((expiry.getTime() - Date.now()) / 1000),
  );
  // Another package queued behind this one on the same login: keep the router session alive a few minutes
  // past this package's end so the phone is not logged out at that exact second. The sweep takes over
  // within seconds (promotes the next package and re-logs the phone in); if nothing takes over, the sweep
  // still switches the login off at expiry, so the grace never gives free time.
  const nextBehind = await sql<{ id: string }>`
    select id from customer_packages
    where customer_id = ${pay.customer_id} and status = 'QUEUED'
      and activation_status is distinct from 'AWAITING_DEVICE'
      and mikrotik_username is not distinct from ${username}
      and payment_id <> ${paymentId}
    limit 1
  `;
  const routerSeconds = remaining + (nextBehind[0] ? 240 : 0);

  // Limits follow the ISP path(s) currently connected (see capacity.server.ts).
  // ...of THIS site only: seats and speed caps come from the ISP paths in the site the person is at.
  const capSite = String(device?.siteId ?? pay.site_id ?? "site_default");
  const capacity = await getEffectiveCapacity(capSite);
  const onlineHere = await countOnlineAtSite(capSite);
  if (capacity.maxUsers > 0 && onlineHere >= capacity.maxUsers) {
    if (!packRow) {
      const id = nid("cp");
      await sql`
        insert into customer_packages (
          id, customer_id, package_id, payment_id, start_time, expiry_time,
          speed_limit_kbps, data_limit_mb, status, activation_status, mikrotik_username
        ) values (
          ${id}, ${pay.customer_id}, ${pay.package_id}, ${paymentId},
          ${start.toISOString()}, ${expiry.toISOString()},
          ${pay.download_kbps}, ${pay.data_limit_mb},
          'ACTIVE', 'ACTIVATION_FAILED', ${username}
        )
      `;
    }
    await sql`
      update payments
      set activation_status = 'ACTIVATION_FAILED', updated_at = now()
      where id = ${paymentId}
    `;
    await logEvent(
      "CAPACITY",
      `Hotspot at ${capacity.maxUsers} users. Payment ${String(pay.mpesa_transaction_id ?? paymentId)} held for retry.`,
    );
    return { ok: false, reason: "capacity" };
  }

  const downloadKbps = Math.min(effDownload, capacity.perUserMaxKbps || effDownload);
  const uploadKbps = Math.min(effUpload, capacity.perUserMaxKbps || effUpload);

  // Omada / Ruijie customers are switched on by their vendor driver (keyed by the
  // client MAC the portal redirect gave us). Everyone else takes the original
  // MikroTik path below, unchanged.
  let hwAuth: Awaited<ReturnType<typeof authorizeOnHardware>> | null = null;
  let activationError = "";
  // False only when a MikroTik login was attempted for this phone and did not happen. Then no
  // "live" session is recorded (it would show in Live users with 0 traffic while the phone has
  // no internet); pressing Connect on the portal retries the router login for this phone.
  let routerLoginOk = true;
  try {
    const hwTarget = await resolveHardwareTarget({
      deviceToken: device?.token,
      customerId: String(pay.customer_id),
      siteId: device?.siteId ?? (pay.site_id ? String(pay.site_id) : null),
    });
    if (hwTarget) {
      // Bought while the site is closed (an allowed package type): the package is paid and
      // running, but the device is only switched on once the site opens (portal "Reconnect").
      const { isRouterClosedNow } = await import("./hours.server");
      if (!(await isRouterClosedNow(hwTarget.router.id))) {
        hwAuth = await authorizeOnHardware(hwTarget, { username, seconds: routerSeconds });
      }
    } else {
      await createAndActivateUser({
        username,
        password,
        downloadKbps,
        uploadKbps,
        sessionTimeoutSeconds: routerSeconds,
        customerId: String(pay.customer_id),
        maxDevices: settings.oneDevicePerPackage ? packageMaxDevices : 1,
        category: effCategory === "STUDENT" ? "STUDENT" : "STANDARD",
        blockedDomains:
          effCategory === "STUDENT"
            ? settings.studentBlockedDomains
                .split(",")
                .map((d) => d.trim())
                .filter(Boolean)
            : undefined,
      });
      // Bought (or re-pushed) while the router is closed for the night: the
      // login exists but stays switched off until the router opens.
      const { isPrimaryClosed } = await import("./hours.server");
      if (await isPrimaryClosed()) {
        await disableUser(username).catch(() => {});
      } else {
        // The hotspot user alone gives no internet: log this phone in on the router too.
        const loggedIn = await loginMikrotikClient({
          deviceToken: device?.token,
          customerId: String(pay.customer_id),
          username,
          password,
        });
        if (!loggedIn) {
          routerLoginOk = false;
          await logEvent(
            "HOTSPOT_LOGIN",
            `Hotspot user ${username} created but the phone was not logged in on the router (no MAC/IP from the router login page, or the router refused). The customer can press Connect.`,
          ).catch(() => {});
        }
      }
    }
  } catch (err) {
    const failed = err instanceof MikroTikError || err instanceof HardwareError;
    if (err instanceof HardwareError) activationError = ` ${err.message}`;
    if (!packRow) {
      const id = nid("cp");
      await sql`
        insert into customer_packages (
          id, customer_id, package_id, payment_id, start_time, expiry_time,
          speed_limit_kbps, data_limit_mb, status, activation_status, mikrotik_username
        ) values (
          ${id}, ${pay.customer_id}, ${pay.package_id}, ${paymentId},
          ${start.toISOString()}, ${expiry.toISOString()},
          ${pay.download_kbps}, ${pay.data_limit_mb},
          'ACTIVE', 'ACTIVATION_FAILED', ${username}
        )
      `;
    } else {
      // A promoted queued package that failed to reach the router becomes
      // ACTIVE + ACTIVATION_FAILED, exactly like a fresh purchase that
      // failed, so the normal retry path (which never re-queues) finishes it.
      await sql`
        update customer_packages
        set activation_status = 'ACTIVATION_FAILED', mikrotik_username = ${username},
            status = 'ACTIVE',
            start_time = ${start.toISOString()}, expiry_time = ${expiry.toISOString()},
            updated_at = now()
        where id = ${packRow.id}
      `;
    }
    await sql`
      update payments
      set activation_status = 'ACTIVATION_FAILED', updated_at = now()
      where id = ${paymentId}
    `;
    await logEvent(
      "ACTIVATION_FAILED",
      `Payment ${String(pay.mpesa_transaction_id ?? paymentId)} confirmed but the router could not activate the user.${activationError}`,
    );
    return {
      ok: false,
      reason: failed ? "router" : "router",
    };
  }

  if (!packRow) {
    const id = nid("cp");
    await sql`
      insert into customer_packages (
        id, customer_id, package_id, payment_id, start_time, expiry_time,
        speed_limit_kbps, data_limit_mb, status, activation_status, mikrotik_username
      ) values (
        ${id}, ${pay.customer_id}, ${pay.package_id}, ${paymentId},
        ${start.toISOString()}, ${expiry.toISOString()},
        ${pay.download_kbps}, ${pay.data_limit_mb},
        'ACTIVE', 'ACTIVATED', ${username}
      )
    `;
    packRow = (await sql<SqlRow>`
      select cp.*, pkg.name as package_name
      from customer_packages cp join packages pkg on pkg.id = cp.package_id
      where cp.id = ${id}
    `)[0];
  } else {
    await sql`
      update customer_packages
      set activation_status = 'ACTIVATED', status = 'ACTIVE',
          start_time = ${start.toISOString()}, expiry_time = ${expiry.toISOString()},
          speed_limit_kbps = ${effDownload},
          mikrotik_username = ${username}, updated_at = now()
      where id = ${packRow.id}
    `;
    packRow = (await sql<SqlRow>`
      select cp.*, pkg.name as package_name
      from customer_packages cp join packages pkg on pkg.id = cp.package_id
      where cp.id = ${packRow.id}
    `)[0];
  }

  // Same secret the router user was just given, so RADIUS (multi-AP) can
  // authenticate this login too.
  await sql`
    update customer_packages set radius_password = ${password} where id = ${packRow.id}
  `;
  if (hwAuth) await linkAuthorization(username, String(packRow.id));

  if (
    settings.oneDevicePerPackage &&
    device?.token &&
    packRow &&
    !deviceAlreadyBound &&
    boundTokens.length < packageMaxDevices
  ) {
    await sql`
      insert into customer_package_devices (customer_package_id, device_token, device_info)
      values (${packRow.id}, ${device.token}, ${device?.info ?? null})
      on conflict do nothing
    `;
    await sql`
      update customer_packages
      set bound_device_token = coalesce(bound_device_token, ${device.token}),
          bound_at = coalesce(bound_at, now()),
          updated_at = now()
      where id = ${packRow.id}
    `;
    // A phone that joined someone else's shared package and now binds to its OWN package leaves the
    // shared one, so it never holds a slot in two packages. Not done for a package this device paid
    // for or whose account is signed in here (a host buying for another number keeps its own).
    if (String(pay.device_token ?? "") === device.token) {
    await sql`
      delete from customer_package_devices
      where device_token = ${device.token}
        and customer_package_id in (
          select cp.id from customer_packages cp
          where cp.customer_id <> ${pay.customer_id}
            and cp.status in ('ACTIVE', 'QUEUED')
            and cp.payment_id not in (select id from payments where device_token = ${device.token})
            and cp.customer_id not in (select customer_id from customer_sessions where device_token = ${device.token})
        )
    `;
    }
    packRow = (await sql<SqlRow>`
      select cp.*, pkg.name as package_name
      from customer_packages cp join packages pkg on pkg.id = cp.package_id
      where cp.id = ${packRow.id}
    `)[0];
  }

  await sql`
    update payments
    set activation_status = 'ACTIVATED', updated_at = now()
    where id = ${paymentId}
  `;

  if (device?.token) {
    await sql`
      update customers set device_token = ${device.token}, updated_at = now()
      where id = ${pay.customer_id}
    `;
  }

  // A second device joining a multi-device package must not end the first
  // device's live session — only a re-activation of the same device (or a
  // promotion with no device) replaces the previous session record.
  const joiningSharedDevice = Boolean(
    device?.token && !deviceAlreadyBound && boundTokens.length > 0 && packageMaxDevices >= 2,
  );
  if (!joiningSharedDevice) {
    await sql`
      update sessions set status = 'DISCONNECTED', session_end = now()
      where customer_id = ${pay.customer_id} and status = 'ACTIVE'
        and mikrotik_username = ${username}
    `;
  }

  if (!routerLoginOk) {
    await sql`
      update payments set activation_status = 'ACTIVATED', updated_at = now()
      where id = ${paymentId}
    `;
    // Paid and running, but the router never put THIS phone online (no MAC/IP, e.g. opened from the
    // installed app instead of the router's login page). The caller must not say "you are online".
    return { ok: true, pack: mapCustomerPackage(packRow), routerLoginFailed: true };
  }

  const sessionId = nid("ses");
  await sql`
    insert into sessions (
      id, customer_id, package_id, customer_package_id, mikrotik_username,
      ip_address, mac_address, device_information, session_start, last_seen, status
    ) values (
      ${sessionId}, ${pay.customer_id}, ${pay.package_id}, ${packRow.id},
      ${username}, ${hwAuth?.clientIp ?? nextIp()}, ${hwAuth?.clientMac ?? randomMac()}, ${device?.info ?? "Captive portal"},
      now(), now(), 'ACTIVE'
    )
  `;

  await logEvent(
    "ACTIVATED",
    `Hotspot user ${username} activated for ${String(pay.phone)}. Package ${String(pay.package_name)} until ${fmtLocal(expiry)}. Speed limit on router: ${downloadKbps}k down / ${uploadKbps}k up. ${timingNote(startedAt)}`,
  );

  return { ok: true, pack: mapCustomerPackage(packRow) };
}

export async function reconnectCustomer(
  customerId: string,
  device?: { token?: string | null; info?: string | null; siteId?: string | null; packageId?: string | null },
) {
  await expireDuePackages();
  const sql = await getSql();
  const rows = await sql<SqlRow>`
    select cp.*, pkg.name as package_name, pkg.download_kbps, pkg.upload_kbps, c.phone, c.status as customer_status
    from customer_packages cp
    join packages pkg on pkg.id = cp.package_id
    join customers c on c.id = cp.customer_id
    where cp.customer_id = ${customerId}
      and cp.status = 'ACTIVE'
      and cp.expiry_time > now()
      and (${device?.packageId ?? null}::text is null or cp.id = ${device?.packageId ?? null}::text)
    order by (cp.id in (select customer_package_id from customer_package_devices where device_token = ${device?.token ?? null}::text)) desc,
             -- a package THIS device paid for that nobody holds yet (failed/queued-then-promoted) beats someone else's
             (cp.payment_id in (select id from payments where device_token = ${device?.token ?? null}::text)
               and not exists (select 1 from customer_package_devices d where d.customer_package_id = cp.id)) desc,
             -- then any package that still has a free device slot, before a full one
             ((select count(*) from customer_package_devices d where d.customer_package_id = cp.id)
               < (case when pkg.max_devices >= 2 then 2 else 1 end)) desc,
             cp.expiry_time desc
    limit 1
  `;
  const row = rows[0];
  if (!row) return { ok: false as const, reason: "none" };
  if (String(row.customer_status) === "BLOCKED") {
    return { ok: false as const, reason: "blocked" };
  }
  // Omada/Ruijie site that is closed: nothing to switch on yet. Say so instead of failing the payment.
  const hwTarget = await resolveHardwareTarget({
    deviceToken: device?.token,
    customerId,
    siteId: device?.siteId ?? null,
  });
  if (hwTarget) {
    const { isRouterClosedNow } = await import("./hours.server");
    if (await isRouterClosedNow(hwTarget.router.id)) return { ok: false as const, reason: "closed" };
  }
  return activateFromPayment(String(row.payment_id), device);
}

export async function releaseDeviceBind(customerId: string) {
  const sql = await getSql();
  await sql`
    delete from customer_package_devices
    where customer_package_id in (
      select id from customer_packages where customer_id = ${customerId} and status = 'ACTIVE'
    )
  `;
  await sql`
    update customer_packages
    set bound_device_token = null,
        bound_mac = null,
        bound_at = null,
        updated_at = now()
    where customer_id = ${customerId} and status = 'ACTIVE'
  `;
  const ses = await sql<{ id: string }>`
    select id from sessions where customer_id = ${customerId} and status = 'ACTIVE'
  `;
  for (const s of ses) await disconnectSession(s.id);
  await logEvent(
    "DEVICE_RELEASE",
    `Device bind released. Another phone can claim this package.`,
  );
}

export async function disconnectSession(sessionId: string) {
  const sql = await getSql();
  const rows = await sql<{ mikrotik_username: string | null }>`
    select mikrotik_username from sessions where id = ${sessionId} limit 1
  `;
  const username = rows[0]?.mikrotik_username;
  if (username) {
    try {
      await disconnectUser(username);
    } catch {
      /* still mark disconnected locally */
    }
  }
  await sql`
    update sessions
    set status = 'DISCONNECTED', session_end = now()
    where id = ${sessionId}
  `;
}

export async function blockCustomer(customerId: string) {
  const sql = await getSql();
  await sql`update customers set status = 'BLOCKED', updated_at = now() where id = ${customerId}`;
  const users = await sql<{ mikrotik_username: string | null }>`
    select mikrotik_username from customer_packages
    where customer_id = ${customerId} and mikrotik_username is not null
  `;
  for (const u of users) {
    if (!u.mikrotik_username) continue;
    try {
      await disconnectUser(u.mikrotik_username);
      await disableUser(u.mikrotik_username);
    } catch {
      /* ledger is source of truth */
    }
  }
  await sql`
    update sessions set status = 'DISCONNECTED', session_end = now()
    where customer_id = ${customerId} and status = 'ACTIVE'
  `;
}

let lastUsageSync = 0;

/**
 * Bring each live session's traffic and IP up to date from the router itself.
 *  - MikroTik: the hotspot "active" list (bytes-out = to the customer = Down, bytes-in = Up).
 *    A customer with two devices on one login has the counters added up.
 *  - Omada / Ruijie: the controller/gateway does not give us per-client traffic, so nothing
 *    is invented: the counters stay at 0 and the Live users page shows "n/a" for those rows.
 * Never throws; an unreachable router just keeps its last known numbers. At most once per 10 s,
 * however many admin screens are open.
 */
export async function tickLiveUsage() {
  if (Date.now() - lastUsageSync < 10_000) return;
  lastUsageSync = Date.now();
  const sql = await getSql();
  const routers = await sql<{ id: string }>`select id from mikrotiks where hardware_type = 'mikrotik'`;
  const wanted = new Set(
    (
      await sql<{ u: string }>`
        select distinct mikrotik_username as u from sessions
        where status = 'ACTIVE' and mikrotik_username is not null
          and mikrotik_username not in (select username from hw_authorizations)
      `
    ).map((r) => r.u),
  );
  if (wanted.size === 0) return;
  await Promise.all(
    routers.map(async (r) => {
      try {
        const creds = await getRouterCredentialsById(r.id);
        if (!creds) return;
        const active = await rosList(creds, "/ip/hotspot/active");
        const totals = new Map<string, { down: number; up: number; ip: string | null }>();
        for (const a of active) {
          const user = String(a.user ?? "");
          if (!wanted.has(user)) continue;
          const cur = totals.get(user) ?? { down: 0, up: 0, ip: null };
          cur.down += Number.parseInt(String(a["bytes-out"] ?? "0"), 10) || 0;
          cur.up += Number.parseInt(String(a["bytes-in"] ?? "0"), 10) || 0;
          cur.ip = cur.ip ?? (a.address ? String(a.address) : null);
          totals.set(user, cur);
        }
        for (const [user, t] of totals) {
          await sql`
            update sessions set
              bytes_down = greatest(bytes_down, ${t.down}),
              bytes_up = greatest(bytes_up, ${t.up}),
              ip_address = coalesce(${t.ip}, ip_address),
              last_seen = now()
            where status = 'ACTIVE' and mikrotik_username = ${user}
          `;
        }
      } catch (err) {
        console.error("[usage]", r.id, err instanceof Error ? err.message : err);
      }
    }),
  );
}

/**
 * A phone has just reached the router (portal visit / auto-reconnect / account sign-in):
 * start the paid-while-away package that was waiting for it. Only the device that paid
 * (or the signed-in account that owns the package) can start it. One package per call.
 */
export async function startAwaitingForDevice(
  token: string,
  opts?: { customerId?: string | null; siteId?: string | null },
): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{ payment_id: string }>`
    select cp.payment_id
    from customer_packages cp
    join payments p on p.id = cp.payment_id
    join customers c on c.id = cp.customer_id
    where cp.status = 'QUEUED' and cp.activation_status = 'AWAITING_DEVICE'
      and cp.start_time <= now() and c.status != 'BLOCKED'
      and (p.device_token = ${token}
           or (${opts?.customerId ?? null}::text is not null and cp.customer_id = ${opts?.customerId ?? null}))
    order by cp.start_time asc
    limit 1
  `;
  if (!rows[0]) return false;
  if (!(await hasFreshContext(token))) return false;
  const res = await activateFromPayment(String(rows[0].payment_id), { token, siteId: opts?.siteId ?? null }, {
    promote: true,
  });
  return res.ok && !res.queued;
}
