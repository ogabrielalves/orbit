import type {
  ActivityEntry,
  Attachment,
  Board,
  BoardColumn,
  ChecklistItem,
  Comment,
  FavoriteEntry,
  Project,
  Settings,
  Tag,
  Task,
} from "@/bindings";

import { type SeedNote, type StoredNote, storedNoteFrom } from "./vaultTypes";

export type StoredColumn = Omit<BoardColumn, "taskCount">;
export type StoredTag = Omit<Tag, "taskCount">;
export type TaskTag = { taskId: string; tagId: string };

export type State = {
  sequence: number;
  settings: Settings;
  projects: Project[];
  activity: ActivityEntry[];
  favorites: FavoriteEntry[];
  boards: Board[];
  columns: StoredColumn[];
  tasks: Task[];
  checklist: ChecklistItem[];
  comments: Comment[];
  tags: StoredTag[];
  taskTags: TaskTag[];
  attachments: Attachment[];
  folders: string[];
  notes: StoredNote[];
};

export type Seed = {
  folders?: string[];
  notes?: SeedNote[];
  settings?: Partial<Settings>;
  projects?: Project[];
  boards?: Board[];
  columns?: StoredColumn[];
  tasks?: Task[];
  tags?: StoredTag[];
  taskTags?: TaskTag[];
};

export const STORAGE_KEY = "orbit-e2e-state";

export function createInitialState(seed: Seed): State {
  return {
    sequence: 0,
    settings: { language: null, vaultPath: null, userName: null, ...seed.settings },
    projects: seed.projects ?? [],
    activity: [],
    favorites: [],
    boards: seed.boards ?? [],
    columns: seed.columns ?? [],
    tasks: seed.tasks ?? [],
    checklist: [],
    comments: [],
    tags: seed.tags ?? [],
    taskTags: seed.taskTags ?? [],
    attachments: [],
    folders: seed.folders ?? [],
    notes: (seed.notes ?? []).map(storedNoteFrom),
  };
}

export function loadState(seed: Seed, storage: Storage): State {
  const saved = storage.getItem(STORAGE_KEY);
  if (saved === null) {
    return createInitialState(seed);
  }
  return JSON.parse(saved) as State;
}

export function saveState(state: State, storage: Storage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}
