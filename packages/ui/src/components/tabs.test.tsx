import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";

function renderTabs() {
  return render(
    <Tabs defaultValue="a">
      <TabsList>
        <TabsTrigger value="a">Tab A</TabsTrigger>
        <TabsTrigger value="b">Tab B</TabsTrigger>
      </TabsList>
      <TabsContent value="a">Panel A</TabsContent>
      <TabsContent value="b">Panel B</TabsContent>
    </Tabs>,
  );
}

describe("Tabs (Radix-backed)", () => {
  it("exposes WAI-ARIA tab roles", () => {
    renderTabs();
    expect(screen.getByRole("tablist")).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByRole("tabpanel")).toBeTruthy(); // only the active panel is mounted
  });

  it("tracks the active tab with aria-selected", () => {
    renderTabs();
    const [a, b] = screen.getAllByRole("tab");
    expect(a.getAttribute("aria-selected")).toBe("true");
    expect(b.getAttribute("aria-selected")).toBe("false");
    expect(screen.getByText("Panel A")).toBeTruthy();
    expect(screen.queryByText("Panel B")).toBeNull(); // inactive content is unmounted
  });

  it("moves selection with the arrow keys", async () => {
    renderTabs();
    const [a, b] = screen.getAllByRole("tab");
    a.focus();
    fireEvent.keyDown(a, { key: "ArrowRight" });
    await waitFor(() => {
      expect(b.getAttribute("aria-selected")).toBe("true");
    });
    expect(screen.getByText("Panel B")).toBeTruthy();
  });
});
