import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeAll, vi } from "vitest";
import { installMatchMedia, resetViewport } from "@/test/viewport";

vi.mock("@/bindings", () => ({
  commands: {
    getSettings: vi.fn().mockResolvedValue({
      status: "ok",
      data: { language: null, vaultPath: null },
    }),
    updateSettings: vi.fn(),
  },
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  installMatchMedia();
  globalThis.ResizeObserver = ResizeObserverStub;
  window.scrollTo = () => {};
});

afterEach(() => {
  cleanup();
  resetViewport();
});
