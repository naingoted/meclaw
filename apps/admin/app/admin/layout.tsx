import * as React from "react";
import { Button } from "@meclaw/ui";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { signOutAction } from "./actions";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <AdminSidebar />
      <main className="flex-1 p-6">
        <form action={signOutAction} className="mb-4">
          <Button type="submit" variant="outline" size="sm">
            Sign out
          </Button>
        </form>
        {children}
      </main>
    </div>
  );
}
