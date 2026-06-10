"use client";
import * as React from "react";

type FetchOptions<TData> = {
  key?: string[];
  onSuccess?: (data: TData) => void;
  onError?: (error: Error) => void;
  /** Poll every N ms. Undefined = no polling. */
  pollInterval?: number;
};

type FetchResult<TData> = {
  data: TData | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
};

/**
 * Wraps fetch() with loading state, error handling, refetch,
 * cache invalidation via CustomEvent, and optional polling.
 */
export function useAdminFetch<TData = unknown>(
  endpoint: string,
  options: FetchOptions<TData> = {},
): FetchResult<TData> {
  const { key, onSuccess, onError, pollInterval } = options;

  const [data, setData] = React.useState<TData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<Error | null>(null);
  const mounted = React.useRef(true);

  const doFetch = React.useCallback(async () => {
    try {
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`GET ${endpoint} failed: ${res.status}`);
      const json = (await res.json()) as TData;
      if (!mounted.current) return;
      setData(json);
      setError(null);
      onSuccess?.(json);
    } catch (e) {
      if (!mounted.current) return;
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err);
      onError?.(err);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [endpoint, onSuccess, onError]);

  // Initial fetch
  React.useEffect(() => {
    mounted.current = true;
    // data-fetching; setState guarded by mounted ref + async boundary (intentional setState in effect)
    void doFetch();
    return () => {
      mounted.current = false;
    };
  }, [doFetch]);

  // Listen for cache invalidation events
  React.useEffect(() => {
    if (!key?.length) return;
    const handler = (e: Event) => {
      const { keys } = (e as CustomEvent).detail as { keys: string[] };
      if (keys.some((k) => key.includes(k))) void doFetch();
    };
    window.addEventListener("admin-cache-invalidate", handler);
    return () => window.removeEventListener("admin-cache-invalidate", handler);
  }, [key, doFetch]);

  // Polling
  React.useEffect(() => {
    if (!pollInterval) return;
    const t = setInterval(() => void doFetch(), pollInterval);
    return () => clearInterval(t);
  }, [pollInterval, doFetch]);

  const refetch = React.useCallback(() => {
    setLoading(true);
    void doFetch();
  }, [doFetch]);

  return { data, loading, error, refetch };
}
