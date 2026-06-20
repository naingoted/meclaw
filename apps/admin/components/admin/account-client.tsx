"use client";

import { Button, Input, Label } from "@meclaw/ui";
import { useState } from "react";
import type { AdminActor } from "@/lib/admin/users";

export function AccountClient({ admin }: { admin: AdminActor }) {
  const [status, setStatus] = useState<string | null>(null);

  async function onSubmit(formData: FormData) {
    setStatus(null);
    const res = await fetch("/api/admin/account/password", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        currentPassword: formData.get("currentPassword"),
        newPassword: formData.get("newPassword"),
        confirmPassword: formData.get("confirmPassword"),
      }),
    });

    setStatus(res.ok ? "Password updated." : "Password update failed.");
  }

  return (
    <div className="grid max-w-2xl gap-4">
      <section className="rounded-sm border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Account</h2>
        <div className="mt-4 grid gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">Username</span>
            <div className="font-mono">{admin.username}</div>
          </div>
          <div>
            <span className="text-muted-foreground">Role</span>
            <div className="font-mono">{admin.role}</div>
          </div>
        </div>
      </section>

      <section className="rounded-sm border border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">Password</h2>
        <form action={onSubmit} className="mt-4 grid gap-3">
          {/* Hidden username so password managers can associate the credential
              with this account (a11y: "password forms should have a username field"). */}
          <input
            type="text"
            name="username"
            autoComplete="username"
            defaultValue={admin.username}
            readOnly
            hidden
          />
          <div className="grid gap-2">
            <Label htmlFor="currentPassword">Current password</Label>
            <Input
              id="currentPassword"
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="newPassword">New password</Label>
            <Input
              id="newPassword"
              name="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="confirmPassword">Confirm password</Label>
            <Input
              id="confirmPassword"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit">Change password</Button>
            {status ? (
              <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
                {status}
              </p>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  );
}
