import { ThemeProvider } from "@meclaw/ui";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatLayout } from "./chat-layout";

describe("ChatLayout", () => {
  it("uses calUrl and githubUrl from props", () => {
    render(
      <ThemeProvider>
        <ChatLayout
          calUrl="https://cal.com/owner"
          githubUrl="https://github.com/owner"
          versionLabel="meclaw · v1.2.3 · abc1234"
        >
          <div>body</div>
        </ChatLayout>
      </ThemeProvider>,
    );
    const bookLink = screen.getByRole("link", { name: /Book a call/i });
    expect(bookLink).toHaveAttribute("href", "https://cal.com/owner");
    const ghLink = screen.getByRole("link", { name: /GitHub/i });
    expect(ghLink).toHaveAttribute("href", "https://github.com/owner");
  });

  it("renders the version label in the footer", () => {
    render(
      <ThemeProvider>
        <ChatLayout
          calUrl="https://cal.com/owner"
          githubUrl="https://github.com/owner"
          versionLabel="meclaw · v1.2.3 · abc1234"
        >
          <div>body</div>
        </ChatLayout>
      </ThemeProvider>,
    );
    expect(screen.getByText("meclaw · v1.2.3 · abc1234")).toBeInTheDocument();
  });
});
