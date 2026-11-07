import { TelNetMark } from "@/components/brand";
import { APP_NAME } from "@/lib/brand-copy";
import { cn } from "@/lib/utils";

/** Full-screen "Hi-Fi" splash used while a session or page is loading (instead of an empty box). */
export function BrandLoader({ label, className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center", className)}
    >
      <div className="relative grid size-20 place-items-center">
        <span className="absolute inset-0 animate-ping rounded-full bg-accent/15" />
        <span className="absolute inset-2 rounded-full border border-accent/30" />
        <TelNetMark className="relative size-11" />
      </div>
      <p className="font-display text-2xl font-semibold tracking-tight">{APP_NAME}</p>
      <p className="text-sm text-muted">{label ?? "Loading…"}</p>
    </div>
  );
}
