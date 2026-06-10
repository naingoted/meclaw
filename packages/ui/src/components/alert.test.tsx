import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Alert } from "./alert";

describe("Alert", () => {
  it("renders children with role='alert'", () => {
    render(<Alert>Test message</Alert>);
    const alert = screen.getByRole("alert");
    expect(alert).toBeTruthy();
    expect(alert.textContent).toBe("Test message");
  });

  it("applies variant classes", () => {
    const { container } = render(<Alert variant="success">Done</Alert>);
    const element = container.firstChild as HTMLElement;
    expect(element).toBeTruthy();
    expect(element.className).toContain("border-success");
  });
});
