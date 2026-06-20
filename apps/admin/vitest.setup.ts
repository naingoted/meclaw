import { vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// Mock scrollIntoView since jsdom doesn't implement it
Element.prototype.scrollIntoView = vi.fn();

// jsdom lacks Pointer Capture APIs that Radix (Select, etc.) calls during
// open/close. Stub them so component tests can drive Radix interactions.
Element.prototype.hasPointerCapture ??= vi.fn(() => false);
Element.prototype.setPointerCapture ??= vi.fn();
Element.prototype.releasePointerCapture ??= vi.fn();
