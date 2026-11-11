import type { ActivityEntry, FavoriteEntry, Project, Settings } from "@/bindings";

export type State = {
  sequence: number;
  settings: Settings;
  projects: Project[];
  activity: ActivityEntry[];
  favorites: FavoriteEntry[];
};

export type Seed = {
  settings?: Partial<Settings>;
  projects?: Project[];
};

export const STORAGE_KEY = "orbit-e2e-state";

export function createInitialState(seed: Seed): State {
  return {
    sequence: 0,
    settings: { language: null, vaultPath: null, userName: null, ...seed.settings },
    projects: seed.projects ?? [],
    activity: [],
    favorites: [],
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
