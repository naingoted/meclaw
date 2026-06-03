"use client";
import * as React from "react";
import { cn } from "../utils";
const Ctx = React.createContext<{ value: string; set: (v: string) => void } | null>(null);
export function Tabs({ defaultValue, value: controlled, onValueChange, children, className }: { defaultValue?: string; value?: string; onValueChange?: (v: string) => void; children: React.ReactNode; className?: string }) {
  const [internal, setInternal] = React.useState(defaultValue ?? "");
  const value = controlled ?? internal;
  const set = (v: string) => { setInternal(v); onValueChange?.(v); };
  return <Ctx.Provider value={{ value, set }}><div className={className}>{children}</div></Ctx.Provider>;
}
export function TabsList({ children }: { children: React.ReactNode }) {
  return <div className="inline-flex gap-1 rounded-md bg-muted p-1">{children}</div>;
}
export function TabsTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  const c = React.useContext(Ctx)!;
  return <button type="button" onClick={() => c.set(value)} className={cn("cursor-pointer rounded px-3 py-1 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", c.value === value && "bg-background shadow")}>{children}</button>;
}
export function TabsContent({ value, children }: { value: string; children: React.ReactNode }) {
  const c = React.useContext(Ctx)!;
  return c.value === value ? <div className="pt-4">{children}</div> : null;
}
