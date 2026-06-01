import Link from "next/link";

const GROUPS = [
  { label: "Knowledge", items: [["Documents", "/admin/documents"], ["Ingestion & Jobs", "/admin/jobs"]] },
  { label: "Configuration", items: [["Config", "/admin/config"]] },
  { label: "Activity", items: [["Dashboard", "/admin"], ["Audit log", "/admin/audit"]] },
] as const;

export function AdminSidebar() {
  return (
    <nav className="w-56 shrink-0 border-r p-4 text-sm">
      <div className="mb-4 font-semibold">meclaw admin</div>
      {GROUPS.map((g) => (
        <div key={g.label} className="mb-4">
          <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{g.label}</div>
          {g.items.map(([label, href]) => (
            <Link key={href} href={href} className="block rounded px-2 py-1 hover:bg-accent">{label}</Link>
          ))}
        </div>
      ))}
      <Link href="/" className="mt-6 block border-t pt-3 text-muted-foreground hover:text-foreground">Back to chat</Link>
    </nav>
  );
}
