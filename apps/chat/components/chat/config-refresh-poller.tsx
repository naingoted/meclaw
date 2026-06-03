"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

const POLL_MS = 3000;

export type ConfigRefreshStatus = "ready" | "submitted" | "streaming" | "error";

function readVersion(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  const version = (value as { version?: unknown }).version;
  return typeof version === "string" && version.length > 0 ? version : null;
}

export function shouldDeferConfigRefresh(status: ConfigRefreshStatus): boolean {
  return status === "submitted" || status === "streaming";
}

export function ConfigRefreshPoller({
  initialConfigVersion,
  status,
}: {
  initialConfigVersion: string;
  status: ConfigRefreshStatus;
}) {
  const router = useRouter();
  const latestVersion = useRef(initialConfigVersion);
  const statusRef = useRef(status);
  const deferredRef = useRef(false);
  const refreshingRef = useRef(false);
  const refreshTimeoutRef = useRef<number | null>(null);

  const refreshOnce = useCallback(() => {
    refreshingRef.current = true;
    if (refreshTimeoutRef.current !== null) {
      window.clearTimeout(refreshTimeoutRef.current);
    }
    refreshTimeoutRef.current = window.setTimeout(() => {
      refreshingRef.current = false;
      refreshTimeoutRef.current = null;
    }, POLL_MS);
    router.refresh();
  }, [router]);

  useEffect(() => {
    latestVersion.current = initialConfigVersion;
    deferredRef.current = false;
    refreshingRef.current = false;
    if (refreshTimeoutRef.current !== null) {
      window.clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
  }, [initialConfigVersion]);

  useEffect(() => {
    statusRef.current = status;
    if (deferredRef.current && !shouldDeferConfigRefresh(status)) {
      deferredRef.current = false;
      refreshOnce();
    }
  }, [refreshOnce, status]);

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
          deferredRef.current = true;
          return;
        }

        refreshOnce();
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
      if (refreshTimeoutRef.current !== null) {
        window.clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    };
  }, [refreshOnce]);

  return null;
}
