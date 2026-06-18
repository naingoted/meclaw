import { redirect } from "next/navigation";
import { AdminPage } from "@/components/admin/framework";
import { UsersClient } from "@/components/admin/users-client";
import { canManageUsers, getCurrentAdmin } from "@/lib/admin/authz";

export default async function UsersPage() {
  const admin = await getCurrentAdmin();
  if (!admin) {
    redirect("/login");
  }
  if (!canManageUsers(admin)) {
    redirect("/admin");
  }

  return (
    <AdminPage title="Users" subtitle="Create admins, reset passwords, and manage roles.">
      <UsersClient currentUserId={admin.id} />
    </AdminPage>
  );
}
