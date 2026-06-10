import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminToaster } from "./toaster";

describe("AdminToaster", () => {
  it("renders without crashing", () => {
    const { container } = render(<AdminToaster />);
    expect(container.firstChild).toBeTruthy();
  });
});
