import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsersClient } from "./users-client";

describe("UsersClient", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists users and creates a new admin", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "u1",
              username: "root",
              role: "super_admin",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              lastLoginAt: null,
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "u2", username: "ops", role: "admin" }), { status: 201 }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }));

    render(<UsersClient currentUserId="u1" />);

    expect(await screen.findByText("root")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "ops" } });
    fireEvent.change(screen.getByLabelText(/initial password/i), {
      target: { value: "new-password-12" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create user/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/users",
        expect.objectContaining({ method: "POST" }),
      ),
    );
  });

  it("changes role and resets passwords", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: "u2",
              username: "ops",
              role: "admin",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              lastLoginAt: null,
            },
          ]),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "u2", username: "ops", role: "super_admin" }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "u2", username: "ops", role: "super_admin" }), {
          status: 200,
        }),
      );

    render(<UsersClient currentUserId="u1" />);

    expect(await screen.findByText("ops")).toBeTruthy();

    // Drive the Radix Select: open the trigger, then pick the option.
    const roleTrigger = screen.getByLabelText("Role for ops");
    fireEvent.pointerDown(roleTrigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
    const option = await screen.findByRole("option", { name: "super_admin" });
    fireEvent.click(option);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/admin/users/u2",
        expect.objectContaining({ method: "PATCH" }),
      ),
    );

    fireEvent.change(screen.getByLabelText("New password for ops"), {
      target: { value: "reset-password-12" },
    });
    fireEvent.click(screen.getByRole("button", { name: /reset password for ops/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
  });
});
