"use client";
import { Button, cn, ThemeToggle } from "@meclaw/ui";
import {
  FileText,
  Inbox,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Radar,
  ScrollText,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/app/admin/actions";

const GROUPS = [
  {
    label: "Knowledge",
    items: [
      { label: "Documents", href: "/admin/documents", Icon: FileText },
      { label: "Ingestion & Jobs", href: "/admin/jobs", Icon: ListChecks },
      { label: "Gaps", href: "/admin/gaps", Icon: Inbox },
    ],
  },
  {
    label: "Research",
    items: [{ label: "Briefings", href: "/admin/research", Icon: Radar }],
  },
  {
    label: "Configuration",
    items: [
      { label: "Config", href: "/admin/config", Icon: SlidersHorizontal },
      { label: "Embed clients", href: "/admin/embed-clients", Icon: KeyRound },
    ],
  },
  {
    label: "Activity",
    items: [
      { label: "Dashboard", href: "/admin", Icon: LayoutDashboard },
      { label: "Audit log", href: "/admin/audit", Icon: ScrollText },
    ],
  },
] as const;

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <nav className="flex w-56 shrink-0 flex-col border-r border-border bg-sidebar p-4 text-sm">
      <div className="mb-5 font-mono font-bold text-foreground">
        <span className="text-primary">▮</span> meclaw admin
      </div>

      <div className="flex-1">
        {GROUPS.map((g) => (
          <div key={g.label} className="mb-5">
            <div className="mb-1.5 px-2 text-[10px] uppercase tracking-wider text-muted-foreground">
              {g.label}
            </div>
            {g.items.map(({ label, href, Icon }) => {
              const active = href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-sm border-l-2 border-transparent px-2 py-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active && "border-primary bg-primary/10 text-foreground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </Link>
              );
            })}
          </div>
        ))}
      </div>

      <div className="mt-auto space-y-3 border-t border-border pt-3">
        <Link
          href="/"
          className="block rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Back to chat
        </Link>
        <div className="flex items-center justify-between">
          <form action={signOutAction}>
            <Button type="submit" variant="ghost-danger" size="sm" className="gap-2 px-2">
              <LogOut className="h-3.5 w-3.5" /> Sign out
            </Button>
          </form>
          <ThemeToggle />
        </div>
      </div>
    </nav>
  );
}
