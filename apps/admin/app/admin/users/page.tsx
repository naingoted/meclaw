import { AdminPage } from "@/components/admin/framework";
import { UsersClient } from "@/components/admin/users-client";
import { requireSuperAdmin } from "@/lib/admin/authz";

export default async function UsersPage() {
  const admin = await requireSuperAdmin();

  return (
    <AdminPage title="Users" subtitle="Create admins, reset passwords, and manage roles.">
      <UsersClient currentUserId={admin.id} />
    </AdminPage>
  );
}
