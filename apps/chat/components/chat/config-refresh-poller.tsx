"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const POLL_MS = 3000;

function readVersion(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const version = (value as { version?: unknown }).version;
  return typeof version === "string" && version.length > 0 ? version : null;
}

export function shouldDeferConfigRefresh(status: string): boolean {
  return status === "submitted" || status === "streaming";
}

export function ConfigRefreshPoller({
  initialConfigVersion,
  status,
}: {
  initialConfigVersion: string;
  status: string;
}) {
  const router = useRouter();
  const [deferred, setDeferred] = useState(false);
  const latestVersion = useRef(initialConfigVersion);
  const statusRef = useRef(status);
  const refreshingRef = useRef(false);

  useEffect(() => {
    latestVersion.current = initialConfigVersion;
    setDeferred(false);
    refreshingRef.current = false;
  }, [initialConfigVersion]);

  useEffect(() => {
    statusRef.current = status;
    if (deferred && !shouldDeferConfigRefresh(status)) {
      refreshingRef.current = true;
      setDeferred(false);
      router.refresh();
    }
  }, [deferred, router, status]);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (document.visibilityState !== "visible" || refreshingRef.current) return;

      try {
        const res = await fetch("/api/config-version", { cache: "no-store" });
        if (!res.ok) return;
        const version = readVersion(await res.json());
        if (!version || version === latestVersion.current) return;

        if (shouldDeferConfigRefresh(statusRef.current)) {
          setDeferred(true);
          return;
        }

        refreshingRef.current = true;
        router.refresh();
      } catch {
        return;
      }
    }

    const id = window.setInterval(() => {
      if (!cancelled) void poll();
    }, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [router]);

  return null;
}
