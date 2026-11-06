import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PortalShell } from "@/components/portal/portal-shell";
import { Button } from "@/components/ui/button";
import { useDevice } from "@/hooks/use-device";
import { useHardwareHandoff } from "@/hooks/use-hardware-handoff";
import { formatKes, formatRemaining, formatStamp } from "@/lib/format";
import { APP_NAME } from "@/lib/brand-copy";
import { PACKAGE_IN_USE_MESSAGE, deviceInfo, readSite } from "@/lib/device";
import { connectActive, getPaymentStatus } from "@/lib/fn/portal";

export const Route = createFileRoute("/portal/payment-status")({
  validateSearch: (s: Record<string, unknown>) => ({
    paymentId: typeof s.paymentId === "string" ? s.paymentId : "",
  }),
  component: PaymentStatusPage,
});

/** After M-Pesa confirms, keep checking for up to this long before giving up polling. */
const ACTIVATION_WINDOW_MS = 120_000;

/**
 * Quick "does this phone really have internet yet?" probe. A request to a public
 * connectivity endpoint only succeeds once the router has let this phone through.
 */
async function probeInternet(): Promise<boolean> {
  const ctl = new AbortController();
  const t = window.setTimeout(() => ctl.abort(), 3500);
  try {
    await fetch(`https://connectivitycheck.gstatic.com/generate_204?t=${Date.now()}`, {
      mode: "no-cors",
      cache: "no-store",
      signal: ctl.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(t);
  }
}

function PaymentStatusPage() {
  const { paymentId } = Route.useSearch();
  const { device, update } = useDevice();
  const queryClient = useQueryClient();
  const [timedOut, setTimedOut] = useState(false);
  const [internetReady, setInternetReady] = useState(false);
  const [activationExpired, setActivationExpired] = useState(false);
  // When the payment was first seen as paid: the polling window is time based, so a slow
  // router login can never leave the page frozen on a stale state (that needed a refresh).
  const paidSeenAt = useRef<number | null>(null);
  const autoTries = useRef(0);
  const lastAutoAt = useRef(0);

  const q = useQuery({
    queryKey: ["payment", paymentId],
    enabled: Boolean(paymentId),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    queryFn: () => getPaymentStatus({ data: { paymentId } }),
    refetchInterval: (query) => {
      const d = query.state.data;
      const status = d?.ok ? d.payment.status : null;
      if (status === "PENDING") return 2000;
      if (status === "SUCCESS" && d?.ok) {
        if (paidSeenAt.current === null) paidSeenAt.current = Date.now();
        if (Date.now() - paidSeenAt.current > ACTIVATION_WINDOW_MS) return false;
        const act = d.payment.activationStatus;
        if (act === "QUEUED") return false;
        // Paid, router login still being set up (or retrying): keep checking so the page
        // moves on by itself the moment the phone is online.
        if (!d.access?.connected) return 1000;
      }
      return false;
    },
  });

  useEffect(() => {
    const t = window.setTimeout(() => setTimedOut(true), 90_000);
    return () => window.clearTimeout(t);
  }, [paymentId]);

  const payment = q.data?.ok ? q.data.payment : null;
  const access = q.data?.ok ? q.data.access : null;
  const connected = Boolean(
    payment?.status === "SUCCESS" &&
      payment.activationStatus !== "QUEUED" &&
      access?.connected,
  );

  useEffect(() => {
    if (payment?.customerId) {
      update({ customerId: payment.customerId, phone: payment.phone });
    }
  }, [payment?.customerId, payment?.phone, update]);

  // Paid but the router login did not land (callback ran without this phone's browser, or the
  // router was busy): ask for it ourselves, automatically — no button, no refresh.
  useEffect(() => {
    if (!payment || payment.status !== "SUCCESS" || connected) return;
    if (payment.activationStatus === "QUEUED" || access?.otherDevice) return;
    if (!device || autoTries.current >= 4) return;
    const act = payment.activationStatus;
    if (act !== "ACTIVATED" && act !== "ACTIVATION_FAILED") return;
    const now = Date.now();
    if (now - lastAutoAt.current < 4000) return;
    lastAutoAt.current = now;
    autoTries.current += 1;
    connectActive({
      data: {
        token: device.token,
        phone: device.phone ?? undefined,
        customerId: payment.customerId,
        deviceInfo: deviceInfo(),
        site: readSite(),
      },
    })
      .then(() => q.refetch())
      .catch(() => {});
  }, [payment, access, connected, device, q]);

  // If activation is still not done after the polling window, stop the spinner and show recovery options.
  useEffect(() => {
    if (payment?.status !== "SUCCESS" || connected) return;
    const t = window.setTimeout(() => setActivationExpired(true), ACTIVATION_WINDOW_MS);
    return () => window.clearTimeout(t);
  }, [payment?.status, connected]);

  // The moment we are online, drop every stale copy of the account so the Account and
  // Connect pages show the live state straight away.
  useEffect(() => {
    if (connected) {
      queryClient.removeQueries({ queryKey: ["account"] });
      queryClient.invalidateQueries({ queryKey: ["portal"] });
    }
  }, [connected, queryClient]);

  // Ruijie / Reyee: finish the gateway login as soon as we are connected.
  useHardwareHandoff(connected, device?.token);

  // Confirm real internet reachability once connected (does not block the success state).
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    let tries = 0;
    const run = async () => {
      while (!cancelled && tries < 12) {
        tries += 1;
        if (await probeInternet()) {
          if (!cancelled) setInternetReady(true);
          return;
        }
        await new Promise((r) => setTimeout(r, 1200));
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [connected]);

  const activating =
    payment?.status === "SUCCESS" &&
    !connected &&
    payment.activationStatus !== "QUEUED" &&
    !(payment.activationStatus === "ACTIVATION_FAILED" && access?.otherDevice) &&
    !activationExpired;

  return (
    <PortalShell hotspotName={APP_NAME}>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-subtle">
        Payment status
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
        {connected
          ? "You are online"
          : payment?.status === "SUCCESS"
          ? "Payment received"
          : payment?.status === "FAILED" || payment?.status === "CANCELLED"
            ? "Payment did not complete"
            : "Waiting for M-Pesa"}
      </h1>

      {payment?.status === "PENDING" && (
        <>
          <p className="mt-3 text-sm text-muted">
            Check your phone and enter your M-Pesa PIN to pay{" "}
            {payment ? formatKes(payment.amount) : ""} for {payment?.packageName}.
          </p>
          <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
            <p className="text-xs uppercase tracking-wide text-subtle">Live STK Push</p>
            <p className="mt-2 font-display text-lg font-semibold">
              {payment.packageName} · {formatKes(payment.amount)}
            </p>
            <p className="mt-2 text-sm text-muted">
              Confirm the Safaricom prompt on your phone. This page updates when
              Daraja reports the result — there is no demo PIN.
            </p>
          </div>
          {timedOut && (
            <p className="mt-4 text-sm text-warn">
              Still waiting. If money was deducted, use{" "}
              <Link to="/portal/recover" className="underline">
                Already Paid?
              </Link>{" "}
              with your M-Pesa receipt.
            </p>
          )}
        </>
      )}

      {payment?.status === "SUCCESS" && (
        <div className="mt-6 space-y-4">
          <div className="rounded-2xl border border-ok/20 bg-ok/10 p-5">
            <p className="text-sm text-ok">M-Pesa confirmed</p>
            {payment.mpesaTransactionId && (
              <p className="mt-2 font-mono text-lg tracking-wide">
                {payment.mpesaTransactionId}
              </p>
            )}
            <p className="mt-2 text-sm text-muted">
              Save this receipt. You can reconnect with it later.
            </p>
          </div>
          {connected ? (
            <>
              <div className="rounded-2xl border border-ok/20 bg-ok/10 p-5 text-center">
                <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-ok/15 text-ok">
                  <Check className="size-7" />
                </div>
                <p className="mt-3 font-display text-xl font-semibold">
                  {internetReady ? "Connected — you can browse now" : "Connected — finishing up…"}
                </p>
                <p className="mt-1 text-sm text-muted">
                  {internetReady
                    ? "Internet is working on this phone."
                    : "Your phone has been authorised. Internet is switching on."}
                </p>
              </div>
              {access?.pack && (
                <div className="rounded-2xl border border-border bg-surface p-5">
                  <p className="text-sm text-muted">Package</p>
                  <p className="mt-1 font-display text-2xl">{access.pack.packageName}</p>
                  <p className="mt-4 text-sm text-muted">Expires</p>
                  <p className="mt-1 font-mono tabular-nums">
                    {formatStamp(access.pack.expiryTime)} · {formatRemaining(access.pack.expiryTime)} left
                  </p>
                </div>
              )}
              <Button asChild size="lg" className="w-full">
                <a href="https://www.google.com" target="_blank" rel="noreferrer">
                  Start browsing
                </a>
              </Button>
              <Button asChild size="lg" className="w-full" variant="secondary">
                <Link to="/portal/account">View my account</Link>
              </Button>
            </>
          ) : activating ? (
            <div className="rounded-2xl border border-border bg-surface p-5">
              <div className="flex items-center gap-3">
                <Loader2 className="size-5 animate-spin text-accent" />
                <p className="font-display text-lg font-semibold">Switching your internet on…</p>
              </div>
              <p className="mt-2 text-sm text-muted">
                Payment confirmed. This takes a few seconds — this page will update by itself.
              </p>
            </div>
          ) : payment.activationStatus === "ACTIVATION_FAILED" ? (
            <>
              <p className="text-sm text-warn">
                {access?.otherDevice
                  ? PACKAGE_IN_USE_MESSAGE
                  : "Payment received. Your package could not be activated yet. Please use Already Paid? to reconnect."}
              </p>
              <Button asChild size="lg" className="w-full">
                <Link to="/portal/recover">Recover my package</Link>
              </Button>
            </>
          ) : payment.activationStatus === "QUEUED" ? (
            <>
              <p className="text-sm text-muted">
                You still have time left on your current package, so{" "}
                {payment.packageName} is queued and will kick in automatically
                the moment it ends — nothing to do now.
              </p>
              <Button asChild size="lg" className="w-full" variant="secondary">
                <Link to="/portal/account">View my account</Link>
              </Button>
            </>
          ) : (
            <Button asChild size="lg" className="w-full">
              <Link to="/portal/connect">Connect now</Link>
            </Button>
          )}
        </div>
      )}

      {(payment?.status === "FAILED" || payment?.status === "CANCELLED") && (
        <div className="mt-6 space-y-4">
          <p className="mt-3 text-sm text-muted">
            {payment.resultDesc || "The M-Pesa request was not completed."}
          </p>
          <Button asChild size="lg" className="w-full">
            <Link to="/portal/packages">Choose a package</Link>
          </Button>
        </div>
      )}
    </PortalShell>
  );
}
