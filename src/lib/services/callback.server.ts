import { getSql } from "@/lib/db";
import { parseCallback, queryStkStatus } from "./mpesa.server";
import { activateFromPayment } from "./activation.server";
import { getSettings, logEvent } from "./settings.server";

/**
 * Idempotent settle: only PENDING → SUCCESS/FAILED once.
 * Activation failures leave SUCCESS + ACTIVATION_FAILED and schedule retry.
 */
export async function settlePendingByCheckout(input: {
  checkoutRequestId: string;
  resultCode: number;
  resultDesc: string;
  receipt: string | null;
}): Promise<boolean> {
  const sql = await getSql();
  const rows = await sql<{
    id: string;
    status: string;
    activation_status: string;
    mpesa_transaction_id: string | null;
    pending_receipt: string | null;
  }>`
    select id, status, activation_status, mpesa_transaction_id, pending_receipt from payments
    where checkout_request_id = ${input.checkoutRequestId}
    limit 1
  `;
  const pay = rows[0];
  if (!pay) return false;
  // The status poll / background check confirms the money but Safaricom's query never returns the
  // receipt; use the one a callback claimed earlier (kept in pending_receipt) so it is never blank.
  const receipt = input.receipt ?? pay.pending_receipt ?? null;

  // Already final money state — still try activation if paid but not activated
  if (pay.status === "SUCCESS") {
    // The status poll can settle a payment before Safaricom's callback arrives; the
    // callback is the only place the receipt number comes from, so keep it.
    if (receipt && !pay.mpesa_transaction_id) {
      await sql`
        update payments set mpesa_transaction_id = ${receipt}, updated_at = now()
        where id = ${pay.id} and mpesa_transaction_id is null
      `;
    }
    if (
      pay.activation_status === "ACTIVATION_FAILED" ||
      pay.activation_status === "NOT_ACTIVATED"
    ) {
      await queueActivationRetry(pay.id, null);
      await activateFromPayment(pay.id);
    }
    return true;
  }
  if (pay.status !== "PENDING") return false;

  if (input.resultCode === 0) {
    const updated = await sql`
      update payments
      set status = 'SUCCESS',
          mpesa_transaction_id = coalesce(${receipt}, mpesa_transaction_id),
          result_code = ${input.resultCode},
          result_desc = ${input.resultDesc},
          transaction_date = coalesce(transaction_date, now()),
          callback_received_at = now(),
          updated_at = now()
      where id = ${pay.id} and status = 'PENDING'
      returning id
    `;
    if (!updated.length) return true; // lost race — another worker settled

    await logEvent("PAYMENT", `M-Pesa ${receipt ?? pay.id} settled.`);
    const result = await activateFromPayment(pay.id);
    if (!result.ok) {
      await queueActivationRetry(
        pay.id,
        result.reason === "router"
          ? "Router unavailable after successful payment"
          : result.reason || "Activation failed",
      );
      await logEvent(
        "ACTIVATION_FAILED",
        `Payment ${receipt ?? pay.id} paid but activation failed. Queued for retry.`,
      );
    }
    return true;
  }

  const cancelled = input.resultCode === 1032;
  await sql`
    update payments
    set status = ${cancelled ? "CANCELLED" : "FAILED"},
        result_code = ${input.resultCode},
        result_desc = ${input.resultDesc},
        callback_received_at = now(),
        updated_at = now()
    where id = ${pay.id} and status = 'PENDING'
  `;
  return true;
}

export async function queueActivationRetry(paymentId: string, error: string | null) {
  const sql = await getSql();
  await sql`
    update payments
    set activation_status = 'ACTIVATION_FAILED',
        activation_attempts = activation_attempts + 1,
        last_activation_error = ${error},
        next_activation_retry_at = now() + interval '2 minutes',
        updated_at = now()
    where id = ${paymentId}
  `;
}

/** Process due activation retries (SUCCESS money, failed router). */
export async function processActivationRetries(limit = 20) {
  const sql = await getSql();
  const due = await sql<{ id: string; attempts: number }>`
    select id, activation_attempts as attempts from payments
    where status = 'SUCCESS'
      and activation_status in ('ACTIVATION_FAILED', 'NOT_ACTIVATED')
      and (next_activation_retry_at is null or next_activation_retry_at <= now())
      and activation_attempts < 10
    order by updated_at asc
    limit ${limit}
  `;
  const results: Array<{ id: string; ok: boolean }> = [];
  for (const row of due) {
    const result = await activateFromPayment(row.id);
    if (result.ok) {
      await sql`
        update payments
        set last_activation_error = null,
            next_activation_retry_at = null,
            updated_at = now()
        where id = ${row.id}
      `;
      results.push({ id: row.id, ok: true });
    } else {
      await queueActivationRetry(
        row.id,
        result.reason === "router"
          ? "Router still unavailable"
          : result.reason || "Activation failed",
      );
      results.push({ id: row.id, ok: false });
    }
  }
  return results;
}

export async function handleMpesaCallback(request: Request): Promise<Response> {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    return new Response("invalid", { status: 400 });
  }
  const parsed = parseCallback(body);
  if (!parsed.checkoutRequestId) {
    return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }
  // Shop (airtime / data) orders have their own table and may use their own till.
  const { findOrderByCheckout, settleOrderByCheckout, shopPayOverride } = await import("./shop.server");
  const shopOrder = await findOrderByCheckout(parsed.checkoutRequestId);
  if (shopOrder) {
    if (parsed.resultCode === 0 && shopOrder.status === "PENDING" && (await getSettings()).mpesaEnv === "production") {
      if (parsed.amount != null && Number(parsed.amount) !== shopOrder.amount) {
        await logEvent("SHOP", `Ignored callback ${parsed.checkoutRequestId}: amount ${parsed.amount} does not match KES ${shopOrder.amount}.`).catch(() => {});
        return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
      }
      let confirmed = false;
      const override = await shopPayOverride();
      for (let i = 0; i < 3 && !confirmed; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 1500));
        try {
          confirmed = (await queryStkStatus(parsed.checkoutRequestId, override)).resultCode === 0;
        } catch {
          /* try again, then leave it pending for the customer's status poll */
        }
      }
      if (!confirmed) return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
    }
    await settleOrderByCheckout({
      checkoutRequestId: parsed.checkoutRequestId,
      resultCode: parsed.resultCode,
      resultDesc: parsed.resultDesc,
      receipt: parsed.receipt,
    });
    return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
  }
  // The callback URL is public and the CheckoutRequestID is visible to the paying
  // customer's browser, so on production a POSTed "success" is never taken at face
  // value: the amount must match and Safaricom itself must confirm the result.
  if (parsed.resultCode === 0 && (await getSettings()).mpesaEnv === "production") {
    const sql = await getSql();
    const pay = (
      await sql<{ status: string; amount: number }>`
        select status, amount from payments where checkout_request_id = ${parsed.checkoutRequestId} limit 1
      `
    )[0];
    if (!pay) {
      await logEvent("PAYMENT", `M-Pesa callback ${parsed.checkoutRequestId} (receipt ${parsed.receipt ?? "none"}, KES ${parsed.amount ?? "?"}) matches no payment here; ignored.`).catch(() => {});
      return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
    }
    if (pay.status === "PENDING") {
      if (parsed.amount != null && Number(parsed.amount) !== Number(pay.amount)) {
        await logEvent("PAYMENT", `Ignored M-Pesa callback ${parsed.checkoutRequestId}: amount ${parsed.amount} does not match KES ${pay.amount}.`).catch(() => {});
        return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
      }
      let confirmed = false;
      for (let i = 0; i < 3 && !confirmed; i++) {
        if (i > 0) await new Promise((r) => setTimeout(r, 1500));
        try {
          confirmed = (await queryStkStatus(parsed.checkoutRequestId)).resultCode === 0;
        } catch {
          // try again, then leave it PENDING for the customer's status poll to settle
        }
      }
      if (!confirmed) {
        // Safaricom sends the callback once and never again, so do not throw its receipt away: keep it
        // (the payment is still only settled once Safaricom confirms it, by the background check or
        // the customer's status poll) and settle with it.
        await keepClaimedReceipt(parsed.checkoutRequestId, parsed.receipt);
        await logEvent("PAYMENT", `M-Pesa callback ${parsed.checkoutRequestId} could not be confirmed with Safaricom yet; receipt kept, left pending.`).catch(() => {});
        return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
      }
    }
  }
  await settlePendingByCheckout({
    checkoutRequestId: parsed.checkoutRequestId,
    resultCode: parsed.resultCode,
    resultDesc: parsed.resultDesc,
    receipt: parsed.receipt,
  });
  return Response.json({ ResultCode: 0, ResultDesc: "Accepted" });
}

const RECEIPT_RE = /^[A-Z0-9]{8,14}$/;

/** Normalise a receipt typed or sent by a callback; null when it does not look like one. */
export function cleanReceipt(v: string | null | undefined): string | null {
  const r = (v ?? "").trim().toUpperCase();
  return RECEIPT_RE.test(r) ? r : null;
}

/** Remember the receipt a callback claimed for a still-pending payment (never settles it). */
async function keepClaimedReceipt(checkoutRequestId: string, receipt: string | null) {
  const r = cleanReceipt(receipt);
  if (!r) return;
  try {
    const sql = await getSql();
    await sql`
      update payments set pending_receipt = ${r}, updated_at = now()
      where checkout_request_id = ${checkoutRequestId} and status = 'PENDING' and pending_receipt is null
        and not exists (select 1 from payments o where upper(o.mpesa_transaction_id) = ${r})
    `;
  } catch {
    /* best effort */
  }
}

/**
 * Settle STK payments that are still PENDING even though the customer may have closed the app: ask
 * Safaricom about each one and settle it (with the receipt a callback kept, if any). Without this a
 * paid-but-unconfirmed payment stayed PENDING until the customer happened to reopen the status page.
 * Runs every minute from the server's watcher and from /api/cron/tick; safe to run any time.
 */
export async function reconcilePendingPayments(limit = 6): Promise<number> {
  const sql = await getSql();
  const rows = await sql<{ checkout_request_id: string }>`
    select checkout_request_id from payments
    where status = 'PENDING' and checkout_request_id is not null
      and created_at < now() - interval '45 seconds'
      and created_at > now() - interval '30 minutes'
    order by (pending_receipt is not null) desc, created_at asc
    limit ${limit}
  `;
  let settled = 0;
  for (const row of rows) {
    try {
      const q = await queryStkStatus(row.checkout_request_id);
      const still =
        q.resultCode < 0 ||
        q.resultCode === 4999 ||
        /progress|processing|not found|under process/i.test(q.resultDesc);
      if (q.resultCode === 0 || q.resultCode === 1032 || (q.resultCode > 0 && !still)) {
        await settlePendingByCheckout({
          checkoutRequestId: row.checkout_request_id,
          resultCode: q.resultCode,
          resultDesc: q.resultDesc,
          receipt: null,
        });
        settled++;
      }
    } catch {
      /* Daraja busy or rate-limited: the next minute tries again */
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  return settled;
}
