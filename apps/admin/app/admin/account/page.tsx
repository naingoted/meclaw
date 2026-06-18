import { AccountClient } from "@/components/admin/account-client";
import { AdminPage } from "@/components/admin/framework";
import { requireAdmin } from "@/lib/admin/authz";

export default async function AccountPage() {
  const admin = await requireAdmin();

  return (
    <AdminPage title="Account" subtitle="Manage your admin password. Username is immutable.">
      <AccountClient admin={admin} />
    </AdminPage>
  );
}
