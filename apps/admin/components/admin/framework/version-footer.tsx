"use client";
import * as React from "react";

type VersionInfo = {
  version: string | null;
  commit: string | null;
};

/**
 * Displays the app version in a footer.
 * Fetches from /api/version. Shows "dev" when env vars are unset.
 */
export function VersionFooter() {
  const [info, setInfo] = React.useState<VersionInfo | null>(null);

  React.useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/version");
        if (res.ok) setInfo((await res.json()) as VersionInfo);
      } catch {
        // ignore — stays null
      }
    })();
  }, []);

  const version = info?.version ?? "dev";
  const commit = info?.commit ?? "dev";

  return (
    <footer className="mt-loose border-t border-border pt-item">
      <p className="font-mono text-xs text-muted-foreground">
        meclaw · {version} · {commit}
      </p>
    </footer>
  );
}
