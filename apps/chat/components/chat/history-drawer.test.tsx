import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ChatSession } from "@/lib/chat/sessions";
import { HistoryDrawer } from "./history-drawer";

const sessions: ChatSession[] = [
  { conversationId: "b", resumeToken: "rt", title: "Second", createdAt: 2, updatedAt: 20 },
  { conversationId: "a", resumeToken: "rt", title: "", createdAt: 1, updatedAt: 10 },
];

function setup(overrides: Partial<Parameters<typeof HistoryDrawer>[0]> = {}) {
  const props = {
    open: true,
    sessions,
    activeConversationId: "b",
    onSelect: vi.fn(),
    onDelete: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  render(<HistoryDrawer {...props} />);
  return props;
}

describe("HistoryDrawer", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <HistoryDrawer
        open={false}
        sessions={sessions}
        activeConversationId="b"
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("lists titles (with a placeholder for empty) in the given order", () => {
    setup();
    expect(screen.getByText("Second")).toBeInTheDocument();
    expect(screen.getByText("New conversation")).toBeInTheDocument();
  });

  it("calls onSelect with the conversation id when a row is clicked", () => {
    const props = setup();
    fireEvent.click(screen.getByText("Second"));
    expect(props.onSelect).toHaveBeenCalledWith("b");
  });

  it("calls onDelete with the conversation id when delete is clicked", () => {
    const props = setup();
    const delButtons = screen.getAllByRole("button", { name: /delete conversation/i });
    fireEvent.click(delButtons[0]);
    expect(props.onDelete).toHaveBeenCalledWith("b");
  });

  it("shows an empty state when there are no sessions", () => {
    setup({ sessions: [] });
    expect(screen.getByText(/no past conversations yet/i)).toBeInTheDocument();
  });

  it("calls onClose on Escape", () => {
    const props = setup();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
