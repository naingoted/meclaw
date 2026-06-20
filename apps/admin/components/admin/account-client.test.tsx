import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountClient } from "./account-client";

describe("AccountClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows immutable account identity and changes password", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    render(<AccountClient admin={{ id: "u1", username: "ops", role: "admin" }} />);

    expect(screen.getByText("ops")).toBeTruthy();
    expect(screen.getByText("admin")).toBeTruthy();
    expect(screen.queryByLabelText(/username/i)).toBeNull();

    fireEvent.change(screen.getByLabelText(/current password/i), {
      target: { value: "old-password" },
    });
    fireEvent.change(screen.getByLabelText(/^new password/i), {
      target: { value: "new-password-12" },
    });
    fireEvent.change(screen.getByLabelText(/confirm password/i), {
      target: { value: "new-password-12" },
    });
    fireEvent.click(screen.getByRole("button", { name: /change password/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/account/password",
        expect.objectContaining({ method: "PATCH" }),
      ),
    );
  });
});
