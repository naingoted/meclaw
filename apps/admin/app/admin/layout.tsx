import { AdminToaster } from "@meclaw/ui";
import type * as React from "react";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { VersionFooter } from "@/components/admin/framework/version-footer";
import { requireAdmin } from "@/lib/admin/authz";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar adminRole={admin.role} />
      <div className="flex-1 px-page py-section">
        <main>{children}</main>
        <VersionFooter />
      </div>
      <AdminToaster />
    </div>
  );
}
