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
    listProjects: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    listRecentActivity: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    getProject: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    archiveProject: vi.fn(),
    restoreProject: vi.fn(),
    deleteProject: vi.fn(),
    getBoard: vi.fn(),
    createBoard: vi.fn(),
    updateBoard: vi.fn(),
    deleteBoard: vi.fn(),
    createColumn: vi.fn(),
    updateColumn: vi.fn(),
    moveColumn: vi.fn(),
    deleteColumn: vi.fn(),
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
