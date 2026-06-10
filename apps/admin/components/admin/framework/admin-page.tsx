import type * as React from "react";

interface AdminPageProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}

/**
 * Consistent page layout for admin pages.
 * Provides semantic <header> + <main> landmarks and proper heading hierarchy.
 */
export function AdminPage({ title, subtitle, children, action }: AdminPageProps) {
  return (
    <>
      <header className="mb-section flex items-start justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle ? <p className="mt-tight text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        {action ? <div className="flex gap-item">{action}</div> : null}
      </header>
      <main>{children}</main>
    </>
  );
}
