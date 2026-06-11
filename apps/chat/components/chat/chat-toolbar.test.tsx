import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatToolbar } from "./chat-toolbar";

describe("ChatToolbar", () => {
  it("always renders New chat and fires onNewChat", () => {
    const onNewChat = vi.fn();
    render(<ChatToolbar mode="embed" onNewChat={onNewChat} onOpenHistory={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /new chat/i }));
    expect(onNewChat).toHaveBeenCalledTimes(1);
  });

  it("shows History in both modes and fires onOpenHistory", () => {
    const onOpenHistory = vi.fn();
    const { rerender } = render(
      <ChatToolbar mode="embed" onNewChat={vi.fn()} onOpenHistory={onOpenHistory} />,
    );
    expect(screen.getByRole("button", { name: /history/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /history/i }));
    expect(onOpenHistory).toHaveBeenCalledTimes(1);

    onOpenHistory.mockClear();
    rerender(<ChatToolbar mode="normal" onNewChat={vi.fn()} onOpenHistory={onOpenHistory} />);
    fireEvent.click(screen.getByRole("button", { name: /history/i }));
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
  });

  it("renders a close button with aria-label in embed mode and fires onClose", () => {
    const onClose = vi.fn();
    render(
      <ChatToolbar mode="embed" onNewChat={vi.fn()} onOpenHistory={vi.fn()} onClose={onClose} />,
    );
    const closeBtn = screen.getByRole("button", { name: /close chat/i });
    expect(closeBtn).toBeInTheDocument();
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT render a close button in normal mode", () => {
    render(
      <ChatToolbar mode="normal" onNewChat={vi.fn()} onOpenHistory={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /close chat/i })).not.toBeInTheDocument();
  });
});
