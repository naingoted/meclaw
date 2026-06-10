import { AdminToaster } from "@meclaw/ui";
import * as React from "react";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { VersionFooter } from "@/components/admin/framework/version-footer";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background">
      <AdminSidebar />
      <div className="flex-1 px-page py-section">
        <main>{children}</main>
        <VersionFooter />
      </div>
      <AdminToaster />
    </div>
  );
}
