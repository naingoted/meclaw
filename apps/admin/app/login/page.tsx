import { Button, Input, Label } from "@meclaw/ui";
import { loginAction } from "./actions";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <form action={loginAction} className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold">Admin sign in</h1>
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <Input id="username" name="username" defaultValue="admin" autoComplete="username" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input id="password" name="password" type="password" autoComplete="current-password" />
        </div>
        <Button type="submit" className="w-full">Sign in</Button>
      </form>
    </div>
  );
}
