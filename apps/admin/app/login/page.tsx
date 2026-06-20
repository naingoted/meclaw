"use client";
import { Button, Input, Label } from "@meclaw/ui";
import { useActionState } from "react";
import { type LoginState, loginAction } from "./actions";

const initialState: LoginState = { error: null };

export default function LoginPage() {
  const [state, action, pending] = useActionState(loginAction, initialState);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <form
        action={action}
        className="w-full max-w-sm space-y-4 rounded-md border border-border bg-card p-6"
      >
        <h1 className="font-mono text-lg font-bold text-foreground">
          <span className="text-primary">▮</span> meclaw admin
        </h1>
        <p className="text-xs text-muted-foreground">Sign in to manage content and ingestion.</p>
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input id="username" name="username" defaultValue="admin" autoComplete="username" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" />
        </div>
        {state.error ? (
          <p
            role="alert"
            aria-live="polite"
            className="rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {state.error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
