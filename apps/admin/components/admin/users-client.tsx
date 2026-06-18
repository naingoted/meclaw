"use client";

import { Button, Input, Label, Table, TBody, TD, TH, THead, TR } from "@meclaw/ui";
import { type Dispatch, type SetStateAction, useEffect, useState } from "react";

type Role = "super_admin" | "admin";
type Row = {
  id: string;
  username: string;
  role: Role;
  createdAt: string;
  updatedAt?: string;
  lastLoginAt: string | null;
};

async function fetchUsers(
  setUsers: Dispatch<SetStateAction<Row[]>>,
  setStatus: Dispatch<SetStateAction<string | null>>,
) {
  const res = await fetch("/api/admin/users");
  if (!res.ok) {
    setStatus("Failed to load users.");
    return;
  }

  setUsers((await res.json()) as Row[]);
}

export function UsersClient({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<Row[]>([]);
  const [role, setRole] = useState<Role>("admin");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    void fetchUsers(setUsers, setStatus);
  }, []);

  async function createUser(formData: FormData) {
    setStatus(null);
    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: formData.get("username"),
        password: formData.get("password"),
        role,
      }),
    });

    setStatus(res.ok ? "User created." : "Create failed.");
    if (res.ok) {
      await fetchUsers(setUsers, setStatus);
    }
  }

  async function patchUser(id: string, body: Record<string, string>) {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    setStatus(res.ok ? "User updated." : "Update failed.");
    if (!res.ok) {
      return;
    }

    const updated = (await res.json()) as Partial<Row> & { id?: string };
    setUsers((current) =>
      current.map((user) => (user.id === id ? { ...user, ...updated, id: user.id } : user)),
    );
  }

  async function remove(id: string) {
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    setStatus(res.ok ? "User deleted." : "Delete failed.");
    if (res.ok) {
      await fetchUsers(setUsers, setStatus);
    }
  }

  return (
    <div className="grid gap-6">
      <form action={createUser} className="grid max-w-xl gap-3 rounded-sm border border-border p-4">
        <div className="grid gap-2">
          <Label htmlFor="username">Username</Label>
          <Input id="username" name="username" required />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="password">Initial password</Label>
          <Input id="password" name="password" type="password" minLength={12} required />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="role">Role</Label>
          <select
            id="role"
            aria-label="Role"
            className="h-9 rounded-sm border border-input bg-background px-3 text-sm"
            value={role}
            onChange={(event) => setRole(event.currentTarget.value as Role)}
          >
            <option value="admin">admin</option>
            <option value="super_admin">super_admin</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit">Create user</Button>
          {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
        </div>
      </form>

      <Table>
        <THead>
          <TR>
            <TH>Username</TH>
            <TH>Role</TH>
            <TH>Password reset</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {users.map((user) => (
            <TR key={user.id}>
              <TD>
                <div className="font-mono text-sm">{user.username}</div>
              </TD>
              <TD>
                <select
                  aria-label={`Role for ${user.username}`}
                  className="h-9 rounded-sm border border-input bg-background px-3 text-sm"
                  value={user.role}
                  onChange={(event) =>
                    void patchUser(user.id, { role: event.currentTarget.value as Role })
                  }
                >
                  <option value="admin">admin</option>
                  <option value="super_admin">super_admin</option>
                </select>
              </TD>
              <TD>
                <form
                  action={(formData) =>
                    patchUser(user.id, { password: String(formData.get("password") ?? "") })
                  }
                  className="flex items-center gap-2"
                >
                  <Input
                    aria-label={`New password for ${user.username}`}
                    name="password"
                    type="password"
                    minLength={12}
                    required
                  />
                  <Button type="submit" size="sm">
                    Reset password for {user.username}
                  </Button>
                </form>
              </TD>
              <TD className="text-right">
                <Button
                  type="button"
                  variant="ghost-danger"
                  size="sm"
                  disabled={user.id === currentUserId}
                  onClick={() => void remove(user.id)}
                >
                  Delete
                </Button>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
