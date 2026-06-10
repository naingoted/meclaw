import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MessageMeta } from "./message-meta";

const TS = new Date(2026, 5, 10, 14, 5).getTime();

describe("MessageMeta", () => {
  beforeEach(() => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  });
  afterEach(() => vi.restoreAllMocks());

  it("renders the formatted time with a full datetime title", () => {
    render(<MessageMeta timestamp={TS} text="hi" />);
    const time = screen.getByText(/\b2:05\b|14:05/);
    expect(time).toHaveAttribute("title");
  });

  it("renders an em dash when timestamp is missing", () => {
    render(<MessageMeta text="hi" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("copies the message text on click", async () => {
    render(<MessageMeta timestamp={TS} text="copy me" />);
    fireEvent.click(screen.getByRole("button", { name: /copy/i }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("copy me"));
  });
});
