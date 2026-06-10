"use client";
import * as React from "react";
import { toast } from "sonner";

type MutationOptions<TData> = {
  method?: "POST" | "PUT" | "PATCH" | "DELETE";
  onSuccess?: (data: TData) => void;
  onError?: (error: Error) => void;
  successMessage?: string;
  errorMessage?: string;
  /** Keys to broadcast via CustomEvent for cross-component cache invalidation. */
  invalidateKeys?: string[];
};

type MutationResult<TData> = {
  mutate: (...args: unknown[]) => Promise<TData | null>;
  isPending: boolean;
  error: Error | null;
};

/**
 * Wraps fetch() with loading state, toast notifications, and cache invalidation.
 * The `mutate` function accepts the same args as the endpoint builder (if endpoint
 * is a function) or ignores args (if endpoint is a string).
 */
export function useAdminMutation<TData = unknown>(
  endpoint: string | ((...args: unknown[]) => string),
  options: MutationOptions<TData> = {},
): MutationResult<TData> {
  const {
    method = "POST",
    onSuccess,
    onError,
    successMessage,
    errorMessage,
    invalidateKeys,
  } = options;

  const [isPending, setIsPending] = React.useState(false);
  const [error, setError] = React.useState<Error | null>(null);

  const mutate = React.useCallback(
    async (...args: unknown[]): Promise<TData | null> => {
      setIsPending(true);
      setError(null);
      try {
        const url = typeof endpoint === "function" ? endpoint(...args) : endpoint;
        const res = await fetch(url, {
          method,
          headers: args[0] ? { "content-type": "application/json" } : undefined,
          body: args[0] ? JSON.stringify(args[0]) : undefined,
        });
        if (!res.ok) {
          const text = await res.text().catch(() => res.statusText);
          throw new Error(`${method} ${url} failed: ${res.status} ${text}`);
        }
        const data = (await res.json().catch(() => ({}))) as TData;
        if (successMessage) toast.success(successMessage);
        if (invalidateKeys?.length) {
          window.dispatchEvent(
            new CustomEvent("admin-cache-invalidate", { detail: { keys: invalidateKeys } }),
          );
        }
        onSuccess?.(data);
        return data;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        setError(err);
        toast.error(errorMessage ?? err.message);
        onError?.(err);
        return null;
      } finally {
        setIsPending(false);
      }
    },
    [endpoint, method, onSuccess, onError, successMessage, errorMessage, invalidateKeys],
  );

  return { mutate, isPending, error };
}
