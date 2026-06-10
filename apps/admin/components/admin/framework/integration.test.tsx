import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAdminFetch, useAdminMutation } from "./index";

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function TestHarness() {
  const { data, loading, refetch } = useAdminFetch<{ count: number }>("/api/test", {
    key: ["test-data"],
  });
  const mutation = useAdminMutation("/api/test", {
    method: "POST",
    successMessage: "Done!",
    invalidateKeys: ["test-data"],
  });

  if (loading) return <div>loading</div>;
  return (
    <div>
      <span>count: {data?.count ?? "null"}</span>
      <button
        onClick={() => mutation.mutate({ action: "increment" })}
        disabled={mutation.isPending}
      >
        {mutation.isPending ? "saving" : "save"}
      </button>
      <button onClick={refetch}>refetch</button>
    </div>
  );
}

describe("useAdminMutation + useAdminFetch integration", () => {
  let count = 0;

  beforeEach(() => {
    count = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          count++;
          return new Response(JSON.stringify({ ok: true }));
        }
        return new Response(JSON.stringify({ count }));
      }),
    );
  });

  it("mutation invalidates cache → fetch refetches", async () => {
    render(<TestHarness />);

    await waitFor(() => expect(screen.getByText("count: 0")).toBeInTheDocument());

    await act(async () => {
      screen.getByText("save").click();
      await new Promise((r) => setTimeout(r, 50));
    });

    // After mutation + invalidation, fetch should have been called again
    await waitFor(() => expect(screen.getByText("count: 1")).toBeInTheDocument());
  });
});
