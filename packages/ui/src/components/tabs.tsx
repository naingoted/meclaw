"use client";
import * as React from "react";
import { cn } from "../utils";
const Ctx = React.createContext<{ value: string; set: (v: string) => void } | null>(null);
export function Tabs({ defaultValue, children, className }: { defaultValue: string; children: React.ReactNode; className?: string }) {
  const [value, set] = React.useState(defaultValue);
  return <Ctx.Provider value={{ value, set }}><div className={className}>{children}</div></Ctx.Provider>;
}
export function TabsList({ children }: { children: React.ReactNode }) {
  return <div className="inline-flex gap-1 rounded-md bg-muted p-1">{children}</div>;
}
export function TabsTrigger({ value, children }: { value: string; children: React.ReactNode }) {
  const c = React.useContext(Ctx)!;
  return <button onClick={() => c.set(value)} className={cn("rounded px-3 py-1 text-sm", c.value === value && "bg-background shadow")}>{children}</button>;
}
export function TabsContent({ value, children }: { value: string; children: React.ReactNode }) {
  const c = React.useContext(Ctx)!;
  return c.value === value ? <div className="pt-4">{children}</div> : null;
}
