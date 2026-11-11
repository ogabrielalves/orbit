import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeAll, vi } from "vitest";
import { installMatchMedia, resetViewport } from "@/test/viewport";

vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({
    onDragDropEvent: vi.fn().mockResolvedValue(() => undefined),
  }),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/bindings", () => ({
  events: {
    vaultChanged: { listen: vi.fn().mockResolvedValue(() => undefined) },
  },
  commands: {
    getSettings: vi.fn().mockResolvedValue({
      status: "ok",
      data: { language: null, vaultPath: null },
    }),
    updateSettings: vi.fn(),
    listProjects: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    listRecentActivity: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    getTaskHistory: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    listBacklog: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    listBacklogByProject: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    moveBacklogTask: vi.fn(),
    getVaultStatus: vi.fn().mockResolvedValue({
      status: "ok",
      data: { path: null, isAccessible: false },
    }),
    setupVault: vi.fn(),
    listFolders: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    createFolder: vi.fn(),
    renameFolder: vi.fn(),
    moveFolder: vi.fn(),
    deleteFolder: vi.fn(),
    listNotes: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    getNote: vi.fn(),
    createNote: vi.fn(),
    saveNote: vi.fn(),
    renameNote: vi.fn(),
    moveNote: vi.fn(),
    deleteNote: vi.fn(),
    resolveNoteLink: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    getNoteLinks: vi
      .fn()
      .mockResolvedValue({ status: "ok", data: { outgoing: [], backlinks: [] } }),
    savePastedImage: vi.fn(),
    readVaultImage: vi.fn(),
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
    listBoardTasks: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    getTask: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    archiveTask: vi.fn(),
    restoreTask: vi.fn(),
    deleteTask: vi.fn(),
    duplicateTask: vi.fn(),
    listSubtasks: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    createSubtask: vi.fn(),
    setSubtaskDone: vi.fn(),
    moveSubtask: vi.fn(),
    listChecklistItems: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    createChecklistItem: vi.fn(),
    updateChecklistItem: vi.fn(),
    moveChecklistItem: vi.fn(),
    deleteChecklistItem: vi.fn(),
    listTags: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    listTaskTags: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    createTag: vi.fn(),
    assignTag: vi.fn(),
    unassignTag: vi.fn(),
    listComments: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    createComment: vi.fn(),
    updateComment: vi.fn(),
    deleteComment: vi.fn(),
    listAttachments: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    importAttachment: vi.fn(),
    removeAttachment: vi.fn(),
    openAttachment: vi.fn(),
    moveTask: vi.fn(),
    sendTaskToBoard: vi.fn(),
    sendTaskToBacklog: vi.fn(),
    search: vi.fn().mockResolvedValue({
      status: "ok",
      data: { projects: [], boards: [], tasks: [], notes: [], folders: [] },
    }),
  },
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

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
