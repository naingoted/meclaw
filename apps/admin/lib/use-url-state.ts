"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

/**
 * Bind a single query param to component state. Reads validate against `allowed`
 * (falling back on a missing/garbage value); writes `router.replace` so tab/filter
 * switches stay out of browser history while keeping reloads and shared links stable.
 */
export function useUrlState(
  key: string,
  fallback: string,
  allowed: readonly string[],
): [string, (v: string) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const raw = params.get(key);
  const value = raw !== null && allowed.includes(raw) ? raw : fallback;

  const setValue = useCallback(
    (v: string) => {
      const next = new URLSearchParams(params.toString());
      next.set(key, v);
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [key, params, pathname, router],
  );

  return [value, setValue];
}
