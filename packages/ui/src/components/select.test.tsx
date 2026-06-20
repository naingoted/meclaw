import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

describe("Select", () => {
  it("renders a trigger showing the current value", () => {
    render(
      <Select defaultValue="admin">
        <SelectTrigger aria-label="Role">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="admin">admin</SelectItem>
          <SelectItem value="super_admin">super_admin</SelectItem>
        </SelectContent>
      </Select>,
    );
    // Radix renders a combobox-role trigger; content mounts lazily on open.
    expect(screen.getByRole("combobox", { name: "Role" })).toBeTruthy();
    expect(screen.getByText("admin")).toBeTruthy();
  });

  it("trigger styling matches the Input control (h-9, rounded-md, border-input)", () => {
    render(
      <Select defaultValue="admin">
        <SelectTrigger aria-label="Role">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="admin">admin</SelectItem>
        </SelectContent>
      </Select>,
    );
    const trigger = screen.getByRole("combobox", { name: "Role" });
    expect(trigger.className).toContain("h-9");
    expect(trigger.className).toContain("rounded-md");
    expect(trigger.className).toContain("border-input");
  });
});
