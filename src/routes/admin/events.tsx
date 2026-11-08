import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Download, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listEventsAdmin } from "@/lib/fn/admin";
import { formatStamp } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/events")({
  component: EventsPage,
});

const PERIODS: Record<string, string> = {
  TODAY: "Today",
  WEEK: "This week",
  MONTH: "This month",
  ALL: "All time",
};
const PROBLEM_RE =
  /fail|error|mismatch|does not match|could not|ignored|denied|blocked|unavailable|held for retry|expired/i;

function toneFor(type: string, description: string): "danger" | "warn" | "ok" | "accent" | "neutral" {
  if (/fail|error|denied|blocked/i.test(type)) return "danger";
  if (PROBLEM_RE.test(description)) return "warn";
  if (/payment|referral|voucher/i.test(type)) return "ok";
  if (/router|outage|network/i.test(type)) return "accent";
  return "neutral";
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function EventsPage() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("ALL");
  const [period, setPeriod] = useState("WEEK");
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [limit, setLimit] = useState(100);

  const q = useQuery({
    queryKey: ["events", search, type, period, problemsOnly, limit],
    queryFn: () =>
      listEventsAdmin({
        data: {
          search: search.trim() || undefined,
          type,
          period: period as "TODAY" | "WEEK" | "MONTH" | "ALL",
          problemsOnly,
          limit,
        },
      }),
    placeholderData: (prev) => prev,
    refetchInterval: 30_000,
  });
  const events = q.data?.events ?? [];
  const types = q.data?.types ?? [];
  const reset = () => setLimit(100);

  const csv = useMemo(
    () =>
      "time,type,description\n" +
      events.map((e) => [e.createdAt, e.eventType, e.description].map(csvCell).join(",")).join("\n"),
    [events],
  );
  const download = () => {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `events-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-w-0 max-w-full space-y-4 sm:space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight sm:text-3xl">Events</h1>
          <p className="mt-1 text-sm text-muted">
            Everything the system recorded: payments, activations, router outages, bonuses. Full text, newest first.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={cn("size-4", q.isFetching && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" onClick={download} disabled={events.length === 0}>
            <Download className="size-4" />
            CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
        <Input
          className="col-span-2"
          placeholder="Search text, e.g. mismatch, UK8HQ1P8W5, 0703…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            reset();
          }}
        />
        <select
          aria-label="Type"
          className="h-11 rounded-md border border-border bg-raised px-3 text-sm"
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            reset();
          }}
        >
          <option value="ALL">All types</option>
          {types.map((t) => (
            <option key={t.type} value={t.type}>
              {t.type} ({t.n})
            </option>
          ))}
        </select>
        <select
          aria-label="Period"
          className="h-11 rounded-md border border-border bg-raised px-3 text-sm"
          value={period}
          onChange={(e) => {
            setPeriod(e.target.value);
            reset();
          }}
        >
          {Object.entries(PERIODS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setProblemsOnly((v) => !v);
            reset();
          }}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-sm",
            problemsOnly ? "border-warn/40 bg-warn/10 text-warn" : "border-border text-muted",
          )}
        >
          <AlertTriangle className="size-3.5" />
          Problems only
        </button>
        <span className="text-sm text-muted tabular-nums">
          {q.data ? `${events.length} of ${q.data.total} events` : "Loading…"}
        </span>
      </div>

      {events.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">
          {q.isLoading ? "Loading events…" : "No events match these filters."}
        </Card>
      ) : (
        <ul className="space-y-2">
          {events.map((e) => (
            <li key={e.id} className="rounded-xl border border-border bg-surface p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge tone={toneFor(e.eventType, e.description)}>{e.eventType}</Badge>
                <span className="text-xs tabular-nums text-subtle">{formatStamp(e.createdAt)}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm">{e.description}</p>
            </li>
          ))}
        </ul>
      )}

      {q.data?.hasMore ? (
        <Button variant="outline" className="w-full" disabled={q.isFetching} onClick={() => setLimit((n) => Math.min(1000, n + 100))}>
          Show 100 more
        </Button>
      ) : null}
    </div>
  );
}
