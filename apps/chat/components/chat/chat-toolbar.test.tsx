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

  it("shows History only in normal mode and fires onOpenHistory", () => {
    const onOpenHistory = vi.fn();
    const { rerender } = render(
      <ChatToolbar mode="embed" onNewChat={vi.fn()} onOpenHistory={onOpenHistory} />,
    );
    expect(screen.queryByRole("button", { name: /history/i })).not.toBeInTheDocument();

    rerender(<ChatToolbar mode="normal" onNewChat={vi.fn()} onOpenHistory={onOpenHistory} />);
    fireEvent.click(screen.getByRole("button", { name: /history/i }));
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
  });
});
