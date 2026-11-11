import type { Project, Settings } from "@/bindings";
import { createRecorder } from "./activity";
import { createBoards } from "./boards";
import { createDetails } from "./details";
import { fail } from "./failure";
import { createFolders } from "./folders";
import { createLinks } from "./links";
import { createNotes } from "./notes";
import { type Clock, createProjects } from "./projects";
import type { State } from "./state";
import { createTasks } from "./tasks";
import type { Handlers } from "./types";

const USER_NAME_MAX_LENGTH = 60;
const DEFAULT_ACTIVITY_LIMIT = 10;

type UpdateSettingsInput = Parameters<NonNullable<Handlers["updateSettings"]>>[0];

function normalizeUserName(value: string | null): string | null {
  const name = value?.trim() ?? "";
  if (name.length > USER_NAME_MAX_LENGTH) {
    fail("VALIDATION", "user name is too long");
  }
  return name === "" ? null : name;
}

function sortByRecency(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => {
    if (a.updatedAt !== b.updatedAt) {
      return a.updatedAt < b.updatedAt ? 1 : -1;
    }
    return a.id < b.id ? 1 : -1;
  });
}

export function createHandlers(state: State, clock: Clock): Handlers {
  const projects = createProjects(state, clock);
  const record = createRecorder(state, clock);
  const boards = createBoards(state, clock, record);
  const tasks = createTasks(state, clock, record);
  const details = createDetails(state, clock, record);
  const folders = createFolders(state, record);
  const notes = createNotes(state, clock, record);
  const links = createLinks(state);

  function updateSettings(input: UpdateSettingsInput): Settings {
    const next: Settings = { ...state.settings };
    if (input.language !== undefined) {
      next.language = input.language;
    }
    if (input.userName !== undefined) {
      next.userName = normalizeUserName(input.userName);
    }
    if (input.vaultPath !== undefined) {
      next.vaultPath = input.vaultPath;
    }
    state.settings = next;
    return { ...next };
  }

  return {
    getSettings: () => ({ ...state.settings }),
    updateSettings,
    getVaultStatus: () => ({
      path: state.settings.vaultPath,
      isAccessible: state.settings.vaultPath !== null,
    }),
    setupVault: (input) => {
      const path = input.path.trim();
      if (path === "") {
        fail("VALIDATION", "vault path must not be blank");
      }
      state.settings = { ...state.settings, vaultPath: path };
      return { path, wasCreated: input.create ?? false, noteCount: 0 };
    },
    listProjects: (input) => {
      const scope = input.scope ?? "active";
      const term = input.search?.trim().toLowerCase() ?? "";
      const matches = state.projects.filter((project) => {
        const isArchived = project.archivedAt !== null;
        const isInScope = scope === "all" || (scope === "archived") === isArchived;
        const hasStatus = input.status == null || project.status === input.status;
        const hasTerm =
          term === "" ||
          project.name.toLowerCase().includes(term) ||
          project.description.toLowerCase().includes(term);
        return isInScope && hasStatus && hasTerm;
      });
      return sortByRecency(matches);
    },
    getProject: projects.get,
    createProject: projects.create,
    updateProject: projects.update,
    archiveProject: (id) => projects.setArchived(id, true),
    restoreProject: (id) => projects.setArchived(id, false),
    deleteProject: projects.remove,
    listRecentActivity: (limit) => state.activity.slice(0, limit ?? DEFAULT_ACTIVITY_LIMIT),
    getDashboardSummary: () => ({
      tasks: { total: 0, backlog: 0, pending: 0, inProgress: 0, completed: 0 },
      activeProjectCount: state.projects.filter(
        (project) => project.archivedAt === null && project.status === "active",
      ).length,
      overdueTaskCount: 0,
      upcomingTasks: [],
    }),
    listRecentNotes: () => [],
    listFavorites: () => state.favorites,
    getBoard: boards.details,
    createBoard: boards.create,
    updateBoard: boards.update,
    deleteBoard: boards.remove,
    createColumn: boards.createColumn,
    updateColumn: boards.updateColumn,
    moveColumn: boards.moveColumn,
    deleteColumn: boards.deleteColumn,
    createTask: tasks.create,
    getTask: tasks.find,
    listBoardTasks: tasks.listByBoard,
    updateTask: tasks.update,
    archiveTask: tasks.archive,
    restoreTask: tasks.restore,
    deleteTask: tasks.remove,
    moveTask: tasks.move,
    duplicateTask: tasks.duplicate,
    getTaskHistory: tasks.history,
    createSubtask: tasks.createSubtask,
    listSubtasks: tasks.listSubtasks,
    setSubtaskDone: tasks.setSubtaskDone,
    moveSubtask: tasks.moveSubtask,
    createChecklistItem: details.checklist.create,
    listChecklistItems: details.checklist.list,
    updateChecklistItem: details.checklist.update,
    moveChecklistItem: details.checklist.move,
    deleteChecklistItem: details.checklist.remove,
    createComment: details.comments.create,
    listComments: details.comments.list,
    updateComment: details.comments.update,
    deleteComment: details.comments.remove,
    createTag: details.tags.create,
    listTags: details.tags.list,
    updateTag: details.tags.update,
    deleteTag: details.tags.remove,
    listTaskTags: details.tags.listForTask,
    assignTag: details.tags.assign,
    unassignTag: details.tags.unassign,
    importAttachment: details.attachments.import,
    listAttachments: details.attachments.list,
    removeAttachment: details.attachments.remove,
    openAttachment: details.attachments.open,
    ...folders,
    ...notes,
    ...links,
  };
}
