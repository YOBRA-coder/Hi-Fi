import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Clock, RefreshCw, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { SiteSwitcher } from "@/components/admin/site-switcher";
import { SessionBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ALL_SITES, useAdminSite } from "@/hooks/use-admin-site";
import { kickLiveUser, listLiveUsers } from "@/lib/fn/admin";
import { formatBytes, formatRemaining, formatSpeed, formatStamp } from "@/lib/format";
import { HARDWARE_LABELS, HARDWARE_TYPES } from "@/lib/hardware";
import { formatPhoneDisplay } from "@/lib/phone";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/live-users")({
  component: LiveUsersPage,
});

const SORTS: Record<string, string> = {
  NEWEST: "Newest first",
  EXPIRING: "Expiring soonest",
  DATA: "Most data used",
  SITE: "By site",
  PHONE: "Phone number",
};

const REFRESH_MS = 8000;
/** A session ending within this many minutes is highlighted. */
const SOON_MIN = 15;
const PAGE = 50;

type Row = NonNullable<ReturnType<typeof useLiveRows>["data"]>[number];

function useLiveRows(auto: boolean) {
  return useQuery({
    queryKey: ["live"],
    queryFn: () => listLiveUsers(),
    refetchInterval: auto ? REFRESH_MS : false,
    placeholderData: (prev) => prev,
  });
}

function minutesLeft(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / 60000;
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="min-w-0 p-3 sm:p-4">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-subtle sm:text-xs">
        {icon}
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-1.5 truncate font-display text-xl font-semibold tabular-nums sm:text-2xl">{value}</p>
    </Card>
  );
}

function LiveUsersPage() {
  const qc = useQueryClient();
  const [siteId] = useAdminSite();
  const [auto, setAuto] = useState(true);
  const [search, setSearch] = useState("");
  const [hardware, setHardware] = useState("ALL");
  const [pkg, setPkg] = useState("ALL");
  const [sort, setSort] = useState("NEWEST");
  const [shown, setShown] = useState(PAGE);

  const q = useLiveRows(auto);
  const kick = useMutation({
    mutationFn: (sessionId: string) => kickLiveUser({ data: { sessionId } }),
    onSuccess: () => {
      toast.success("Disconnected");
      qc.invalidateQueries({ queryKey: ["live"] });
    },
    onError: () => toast.error("Could not disconnect this user."),
  });

  const all = q.data ?? [];
  const packages = useMemo(() => [...new Set(all.map((u) => u.packageName))].sort(), [all]);

  const rows = useMemo(() => {
    // Phone search takes 07…, 7…, 254… or +254…; also matches IP, MAC, package, site.
    const raw = search.trim().toLowerCase();
    const digits = raw.replace(/\D/g, "");
    const phoneKey = digits.startsWith("0") ? "254" + digits.slice(1) : digits;
    let list = all.filter((u) => {
      if (siteId !== ALL_SITES && u.siteId !== siteId) return false;
      if (hardware !== "ALL" && u.hardwareType !== hardware) return false;
      if (pkg !== "ALL" && u.packageName !== pkg) return false;
      if (!raw) return true;
      const phoneDigits = u.phone.replace(/\D/g, "");
      return (
        (phoneKey.length >= 3 && phoneDigits.includes(phoneKey)) ||
        [u.ipAddress, u.clientMac, u.packageName, u.siteName, u.routerName]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(raw))
      );
    });
    const by: Record<string, (a: Row, b: Row) => number> = {
      EXPIRING: (a, b) => new Date(a.expiryTime).getTime() - new Date(b.expiryTime).getTime(),
      DATA: (a, b) => b.bytesDown + b.bytesUp - (a.bytesDown + a.bytesUp),
      SITE: (a, b) => a.siteName.localeCompare(b.siteName) || a.phone.localeCompare(b.phone),
      PHONE: (a, b) => a.phone.localeCompare(b.phone),
    };
    if (by[sort]) list = [...list].sort(by[sort]);
    return list;
  }, [all, siteId, hardware, pkg, search, sort]);

  const byHw = (t: string) => rows.filter((u) => u.hardwareType === t).length;
  const filtersOn =
    Boolean(search) || hardware !== "ALL" || pkg !== "ALL" || siteId !== ALL_SITES || sort !== "NEWEST";
  const totalDown = rows.reduce((n, u) => n + (u.hasTraffic ? u.bytesDown : 0), 0);
  const totalUp = rows.reduce((n, u) => n + (u.hasTraffic ? u.bytesUp : 0), 0);
  const endingSoon = rows.filter((u) => minutesLeft(u.expiryTime) <= SOON_MIN).length;
  const visible = rows.slice(0, shown);

  const disconnect = (u: Row) => {
    if (window.confirm(`Disconnect ${formatPhoneDisplay(u.phone)}? Their paid package stays valid.`)) {
      kick.mutate(u.sessionId);
    }
  };

  return (
    <div className="min-w-0 max-w-full space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Live users</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted">
            <span
              className={cn(
                "inline-block size-2 shrink-0 rounded-full",
                q.isError ? "bg-danger" : auto ? "bg-ok" : "bg-subtle",
                q.isFetching && "animate-pulse",
              )}
            />
            {q.isFetching ? "Updating…" : auto ? "Live" : "Paused"}
            {q.dataUpdatedAt ? ` · ${new Date(q.dataUpdatedAt).toLocaleTimeString()}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <SiteSwitcher />
          <label className="flex items-center gap-2 text-sm text-muted">
            Auto
            <Switch checked={auto} onCheckedChange={setAuto} />
          </label>
          <Button variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={cn("size-4", q.isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={<Users className="size-3.5 shrink-0" />} label="Online now" value={String(rows.length)} />
        <Stat icon={<ArrowDown className="size-3.5 shrink-0 text-ok" />} label="Downloaded" value={formatBytes(totalDown)} />
        <Stat icon={<ArrowUp className="size-3.5 shrink-0 text-accent" />} label="Uploaded" value={formatBytes(totalUp)} />
        <Stat
          icon={<Clock className="size-3.5 shrink-0 text-warn" />}
          label={`Ending in ${SOON_MIN} min`}
          value={String(endingSoon)}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        {HARDWARE_TYPES.map((t) =>
          byHw(t) > 0 ? (
            <span key={t} className="tabular-nums">
              {HARDWARE_LABELS[t]}: {byHw(t)}
            </span>
          ) : null,
        )}
        {rows.length !== all.length && <span>(of {all.length} in total)</span>}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 [&>*]:min-w-0">
        <Input
          className="col-span-2 lg:col-span-2"
          placeholder="Search phone (07…), IP, MAC, package, site"
          inputMode="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setShown(PAGE);
          }}
        />
        <select
          aria-label="Hardware"
          className="h-11 rounded-md border border-border bg-raised px-3 text-sm"
          value={hardware}
          onChange={(e) => {
            setHardware(e.target.value);
            setShown(PAGE);
          }}
        >
          <option value="ALL">All hardware</option>
          {HARDWARE_TYPES.map((t) => (
            <option key={t} value={t}>
              {HARDWARE_LABELS[t]}
            </option>
          ))}
        </select>
        <select
          aria-label="Package"
          className="h-11 rounded-md border border-border bg-raised px-3 text-sm"
          value={pkg}
          onChange={(e) => {
            setPkg(e.target.value);
            setShown(PAGE);
          }}
        >
          <option value="ALL">All packages</option>
          {packages.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          aria-label="Sort by"
          className="col-span-2 h-11 rounded-md border border-border bg-raised px-3 text-sm lg:col-span-1"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          {Object.entries(SORTS).map(([k, v]) => (
            <option key={k} value={k}>
              Sort: {v}
            </option>
          ))}
        </select>
      </div>
      {filtersOn && (
        <button
          type="button"
          className="text-sm text-accent underline"
          onClick={() => {
            setSearch("");
            setHardware("ALL");
            setPkg("ALL");
            setSort("NEWEST");
            setShown(PAGE);
          }}
        >
          Clear search, hardware, package and sort
          {siteId !== ALL_SITES ? " (the site is set with the site switcher)" : ""}
        </button>
      )}

      {rows.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          {all.length === 0 ? "No one is online right now." : "No one online matches these filters."}
        </Card>
      ) : (
        <>
          {/* Phones: one card per user, no sideways scrolling */}
          <ul className="space-y-3 md:hidden">
            {visible.map((u) => {
              const soon = minutesLeft(u.expiryTime) <= SOON_MIN;
              return (
                <li key={u.sessionId} className="rounded-xl border border-border bg-surface p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium tabular-nums">{formatPhoneDisplay(u.phone)}</p>
                      <p className="truncate text-xs text-subtle">
                        {u.packageName} · {u.siteName}
                      </p>
                    </div>
                    <SessionBadge status={u.status} />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
                    <div>
                      <dt className="text-subtle">Remaining</dt>
                      <dd className={cn("font-medium tabular-nums", soon && "text-warn")}>
                        {formatRemaining(u.expiryTime)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-subtle">Speed</dt>
                      <dd className="tabular-nums">{formatSpeed(u.speedLimitKbps)}</dd>
                    </div>
                    <div>
                      <dt className="text-subtle">Down</dt>
                      <dd className="tabular-nums">{u.hasTraffic ? formatBytes(u.bytesDown) : "n/a"}</dd>
                    </div>
                    <div>
                      <dt className="text-subtle">Up</dt>
                      <dd className="tabular-nums">{u.hasTraffic ? formatBytes(u.bytesUp) : "n/a"}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-subtle">Device</dt>
                      <dd className="break-all font-mono">{u.clientMac ?? u.ipAddress ?? "—"}</dd>
                    </div>
                    <div className="col-span-2 flex flex-wrap items-center gap-x-2 text-subtle">
                      <Badge tone={u.hardwareType === "mikrotik" ? "neutral" : "accent"}>
                        {HARDWARE_LABELS[u.hardwareType]}
                      </Badge>
                      {u.routerName ? <span>{u.routerName}</span> : null}
                      <span>· started {formatStamp(u.sessionStart)}</span>
                    </div>
                  </dl>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 w-full"
                    disabled={kick.isPending}
                    onClick={() => disconnect(u)}
                  >
                    Disconnect
                  </Button>
                </li>
              );
            })}
          </ul>

          {/* Tablets and desktops: the full table */}
          <div className="hidden overflow-x-auto rounded-xl border border-border bg-surface md:block">
            <Table>
              <TableHeader>
                <TableRow className="whitespace-nowrap">
                  <TableHead>Phone</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Hardware</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Package</TableHead>
                  <TableHead>Speed</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead>Down</TableHead>
                  <TableHead>Up</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((u) => (
                  <TableRow key={u.sessionId} className="whitespace-nowrap">
                    <TableCell className="font-medium tabular-nums">{formatPhoneDisplay(u.phone)}</TableCell>
                    <TableCell className="text-sm">{u.siteName}</TableCell>
                    <TableCell>
                      <Badge tone={u.hardwareType === "mikrotik" ? "neutral" : "accent"}>
                        {HARDWARE_LABELS[u.hardwareType]}
                      </Badge>
                      {u.routerName ? <p className="text-[11px] text-subtle">{u.routerName}</p> : null}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{u.clientMac ?? u.ipAddress ?? "—"}</TableCell>
                    <TableCell>{u.packageName}</TableCell>
                    <TableCell>{formatSpeed(u.speedLimitKbps)}</TableCell>
                    <TableCell className="text-muted">{formatStamp(u.sessionStart)}</TableCell>
                    <TableCell
                      className={cn("tabular-nums", minutesLeft(u.expiryTime) <= SOON_MIN && "font-medium text-warn")}
                    >
                      {formatRemaining(u.expiryTime)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {u.hasTraffic ? (
                        formatBytes(u.bytesDown)
                      ) : (
                        <span className="text-subtle" title="This hardware does not report traffic per customer">
                          n/a
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {u.hasTraffic ? formatBytes(u.bytesUp) : <span className="text-subtle">n/a</span>}
                    </TableCell>
                    <TableCell>
                      <SessionBadge status={u.status} />
                    </TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" disabled={kick.isPending} onClick={() => disconnect(u)}>
                        Disconnect
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {rows.length > shown ? (
            <Button variant="outline" className="w-full" onClick={() => setShown((n) => n + PAGE)}>
              Show more ({rows.length - shown} more)
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}