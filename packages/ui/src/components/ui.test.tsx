import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Button } from "./button";
import { Badge } from "./badge";

describe("ui primitives", () => {
  it("renders a button and a badge", () => {
    render(<><Button>Go</Button><Badge>ready</Badge></>);
    expect(screen.getByText("Go")).toBeTruthy();
    expect(screen.getByText("ready")).toBeTruthy();
  });
});
