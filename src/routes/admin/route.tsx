import { Navigate, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { AdminShell, OWNER_ONLY_PATHS } from "@/components/admin/admin-shell";
import { BrandLoader } from "@/components/brand-loader";
import { useOperatorSession } from "@/lib/operator";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

function AdminLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { isOperator, isPending, isOwner } = useOperatorSession();
  const isLogin = pathname === "/admin/login";

  if (isPending) {
    return <BrandLoader className="bg-bg" label="Opening your console…" />;
  }

  if (isLogin) {
    if (isOperator) {
      return <Navigate to="/admin/dashboard" />;
    }
    return <Outlet />;
  }

  if (!isOperator) {
    return <Navigate to="/login" search={{ redirect: pathname }} />;
  }

  if (!isOwner && OWNER_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return <Navigate to="/admin/dashboard" />;
  }

  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  );
}
