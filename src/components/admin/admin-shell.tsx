import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  CreditCard,
  LayoutDashboard,
  Menu,
  Package,
  Radio,
  Settings,
  ShoppingBag,
  Ticket,
  Users,
  Wifi, Network, ScrollText,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { TelNetMark } from "@/components/brand";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { OperatorUserButton } from "./operator-user-button";
import { APP_NAME } from "@/lib/brand-copy";
import { cn } from "@/lib/utils";
import { useOperatorSession } from "@/lib/operator";


const NAV = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/live-users", label: "Live users", icon: Wifi },
  { to: "/admin/customers", label: "Customers", icon: Users },
  { to: "/admin/packages", label: "Packages", icon: Package },
  { to: "/admin/payments", label: "Transactions", icon: CreditCard },
  { to: "/admin/vouchers", label: "Vouchers", icon: Ticket },
  { to: "/admin/shop", label: "Shop", icon: ShoppingBag },
  { to: "/admin/reports", label: "Reports", icon: Activity },
  { to: "/admin/network", label: "Network", icon: Radio },
  { to: "/admin/network-map", label: "Network map", icon: Network },
  { to: "/admin/events", label: "Events", icon: ScrollText },
  { to: "/admin/settings", label: "Settings", icon: Settings },
] as const;

/** Pages only owners can use (site-limited operators don't see them). */
export const OWNER_ONLY_PATHS = ["/admin/packages", "/admin/network", "/admin/settings", "/admin/events"];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isOwner } = useOperatorSession();
  const nav = isOwner ? NAV : NAV.filter((n) => !OWNER_ONLY_PATHS.includes(n.to));
  const [more, setMore] = useState(false);


  return (
    <div className="flex h-dvh w-full max-w-full overflow-hidden bg-bg lg:h-auto lg:min-h-dvh lg:overflow-x-clip lg:overflow-y-visible">
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-border bg-surface/60 px-3 py-5 lg:flex">
        <Link to="/admin/dashboard" className="mb-6 flex items-center gap-2 px-2">
          <TelNetMark className="size-6" />
          <span className="font-display text-base font-semibold">{APP_NAME}</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5">
          {nav.map((item) => {
            const active =
              pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex h-10 items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors",
                  active
                    ? "bg-raised text-fg"
                    : "text-muted hover:bg-raised/60 hover:text-fg",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      <div className="mt-4 space-y-2 px-1 shrink-0">
    <OperatorUserButton />
  </div>
      </aside>

      <div className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col">
<header className="z-50 flex shrink-0 items-center justify-between border-b border-border bg-black px-4 py-3 lg:hidden"> 
  <Link to="/admin/dashboard" className="flex items-center gap-2"> 
    <TelNetMark className="size-6" /> 
    <span className="font-display font-semibold">{APP_NAME}</span> 
  </Link> 
  <div className="ml-auto"> 
    <OperatorUserButton /> 
  </div> 
</header>
        {/* Phones: this is the only thing that scrolls. overscroll-contain stops the pull-down refresh
            bounce, overflow-anchor:none stops the list jumping when live data refreshes. */}
        <div className="min-h-0 min-w-0 max-w-full flex-1 overflow-y-auto overscroll-y-contain px-4 py-5 [overflow-anchor:none] sm:px-6 lg:overflow-visible lg:px-8">
          {children}
        </div>
        <nav className="grid shrink-0 grid-cols-4 border-t border-border bg-surface px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom,0px))] lg:hidden">
          {nav.slice(0, 3).map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-md py-2 text-xs",
                  active ? "text-accent" : "text-muted",
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
          <button
            type="button"
            className={cn(
              "flex flex-col items-center gap-1 rounded-md py-2 text-xs",
              more ? "text-accent" : "text-muted",
            )}
            onClick={() => setMore(true)}
          >
            <Menu className="size-4" />
            More
          </button>
        </nav>
      </div>

      <Sheet open={more} onOpenChange={setMore}>
        <SheetContent side="bottom" className="lg:hidden">
          <SheetHeader>
            <SheetTitle className="font-display">Console</SheetTitle>
          </SheetHeader>
          <nav className="mt-4 grid grid-cols-2 gap-2">
            {nav.map((item) => {
              const active = pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMore(false)}
                  className={cn(
                    "flex h-12 items-center gap-2 rounded-lg border border-border px-3 text-sm",
                    active ? "bg-raised text-fg" : "text-muted",
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  );
}
