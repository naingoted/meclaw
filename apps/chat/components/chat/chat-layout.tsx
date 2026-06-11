"use client";

import { Button, ThemeToggle } from "@meclaw/ui";
import { Calendar, Download, GitBranch } from "lucide-react";

export function ChatLayout({
  children,
  calUrl,
  githubUrl,
  versionLabel,
  botName = "meclaw",
  brandLogoUrl = "",
  brandAccent = "",
}: {
  children: React.ReactNode;
  calUrl: string;
  githubUrl: string;
  /** Build-time version string (read server-side; passed in to dodge the
   * client-bundle env trap that would otherwise report "dev"). */
  versionLabel: string;
  botName?: string;
  brandLogoUrl?: string;
  brandAccent?: string;
}) {
  return (
    // h-dvh (dynamic viewport) not h-screen (100vh): on mobile the dynamic unit
    // tracks the visible area as the URL bar collapses and the soft keyboard
    // opens, so the sticky header/footer + input stay on-screen. The embed
    // widget uses the same 100dvh basis in embed.js.
    <div
      className="flex h-dvh flex-col"
      style={brandAccent ? ({ "--primary": brandAccent } as React.CSSProperties) : undefined}
    >
      {/* Header: brand left, actions right (Book a call = primary CTA) */}
      <header className="border-b border-border px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 font-mono text-sm font-bold tracking-tight text-foreground">
            {brandLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary external logo URL
              <img
                src={brandLogoUrl}
                alt=""
                className="h-4 w-4 rounded-sm"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="text-primary">▮</span>
            )}{" "}
            {botName}
          </span>
          <div className="flex items-center gap-2">
            <a href="/resume" download>
              <Button variant="outline" size="sm" className="gap-2">
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Résumé</span>
              </Button>
            </a>
            <a href={calUrl} target="_blank" rel="noopener noreferrer">
              <Button size="sm" className="gap-2">
                <Calendar className="h-4 w-4" />
                <span className="hidden sm:inline">Book a call</span>
                <span className="sm:hidden">Book</span>
              </Button>
            </a>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">{children}</div>

      <footer className="border-t border-border px-4 py-2">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <p className="font-mono text-xs text-muted-foreground">
            Built this myself{" "}
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-sm text-foreground transition-colors hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <GitBranch className="h-3 w-3" />
              GitHub
            </a>
          </p>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-muted-foreground/70">{versionLabel}</span>
            <ThemeToggle />
          </div>
        </div>
      </footer>
    </div>
  );
}
