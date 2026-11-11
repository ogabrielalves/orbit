import type { CommandName } from "./types";

export const pendingCommands = [
  "exportDatabase",
  "getDatabaseStatus",
  "importDatabase",
  "sendTaskToBoard",
  "sendTaskToBacklog",
  "listBacklog",
  "listBacklogByProject",
  "moveBacklogTask",
  "reindexVault",
  "savePastedImage",
  "readVaultImage",
  "search",
  "toggleFavorite",
  "moveFavorite",
] as const satisfies readonly CommandName[];
