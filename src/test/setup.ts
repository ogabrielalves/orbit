import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { toast } from "sonner";
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
    getDashboardSummary: vi.fn().mockResolvedValue({
      status: "ok",
      data: {
        tasks: { total: 0, backlog: 0, pending: 0, inProgress: 0, completed: 0 },
        activeProjectCount: 0,
        overdueTaskCount: 0,
        upcomingTasks: [],
      },
    }),
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
    listBoardTasks: vi.fn(),
    getTask: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    archiveTask: vi.fn(),
    restoreTask: vi.fn(),
    deleteTask: vi.fn(),
    moveTask: vi.fn(),
    sendTaskToBoard: vi.fn(),
    sendTaskToBacklog: vi.fn(),
  },
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// The 1s default for findBy*/waitFor is too tight when the whole suite saturates the CPU.
configure({ asyncUtilTimeout: 5000 });

beforeAll(() => {
  installMatchMedia();
  globalThis.ResizeObserver = ResizeObserverStub;
  window.scrollTo = () => {};
});

afterEach(() => {
  toast.dismiss();
  cleanup();
  resetViewport();
});
