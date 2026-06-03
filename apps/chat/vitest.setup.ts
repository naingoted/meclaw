import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// Mock scrollIntoView since jsdom doesn't implement it
Element.prototype.scrollIntoView = vi.fn();

// Mock window.matchMedia for theme provider
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
