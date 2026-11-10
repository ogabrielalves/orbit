import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ListNotesInput, NoteDetails, SaveNoteInput, SetupVaultInput } from "@/bindings";
import { activityKeys } from "@/modules/activity/queries";
import { folderKeys } from "@/modules/folders/queries";
import {
  createNote,
  deleteNote,
  fetchNote,
  fetchNotes,
  fetchVaultStatus,
  moveNote,
  renameNote,
  saveNote,
  setupVault,
} from "@/modules/notes/api";
import { noteLinksKeys } from "@/modules/notes/linksQueries";
import { settingsKeys } from "@/modules/settings/queries";

export const vaultKeys = {
  status: ["vault", "status"] as const,
};

export const noteKeys = {
  all: ["notes"] as const,
  lists: ["notes", "list"] as const,
  list: (input: ListNotesInput) => ["notes", "list", input] as const,
  detail: (id: string) => ["notes", "detail", id] as const,
};

type SaveNoteVariables = { id: string; input: SaveNoteInput };
type RenameNoteVariables = { id: string; newTitle: string };
type MoveNoteVariables = { id: string; newFolderPath: string | null };

export function useVaultStatus() {
  return useQuery({ queryKey: vaultKeys.status, queryFn: fetchVaultStatus });
}

export function useSetupVault() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SetupVaultInput) => setupVault(input),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: vaultKeys.status }),
        queryClient.invalidateQueries({ queryKey: settingsKeys.all }),
        queryClient.invalidateQueries({ queryKey: noteKeys.all }),
        queryClient.invalidateQueries({ queryKey: folderKeys.all }),
      ]),
  });
}

export function useNotes(input: ListNotesInput, isEnabled = true) {
  return useQuery({
    queryKey: noteKeys.list(input),
    queryFn: () => fetchNotes(input),
    placeholderData: keepPreviousData,
    enabled: isEnabled,
  });
}

export function useNote(id: string, isEnabled = true) {
  return useQuery({
    queryKey: noteKeys.detail(id),
    queryFn: () => fetchNote(id),
    enabled: isEnabled,
  });
}

function useInvalidateNotes() {
  const queryClient = useQueryClient();

  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: noteKeys.all }),
      queryClient.invalidateQueries({ queryKey: folderKeys.all }),
      queryClient.invalidateQueries({ queryKey: activityKeys.all }),
    ]);
}

export function useCreateNote() {
  const invalidateNotes = useInvalidateNotes();

  return useMutation({
    mutationFn: createNote,
    onSuccess: invalidateNotes,
  });
}

export function useSaveNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: SaveNoteVariables) => saveNote(id, input),
    onSuccess: (note) => {
      queryClient.setQueryData<NoteDetails>(noteKeys.detail(note.id), note);
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: noteKeys.lists }),
        queryClient.invalidateQueries({ queryKey: noteLinksKeys.all }),
      ]);
    },
  });
}

export function useRenameNote() {
  const invalidateNotes = useInvalidateNotes();

  return useMutation({
    mutationFn: ({ id, newTitle }: RenameNoteVariables) => renameNote(id, newTitle),
    onSuccess: invalidateNotes,
  });
}

export function useMoveNote() {
  const invalidateNotes = useInvalidateNotes();

  return useMutation({
    mutationFn: ({ id, newFolderPath }: MoveNoteVariables) => moveNote(id, newFolderPath),
    onSuccess: invalidateNotes,
  });
}

export function useDeleteNote() {
  const invalidateNotes = useInvalidateNotes();

  return useMutation({
    mutationFn: (id: string) => deleteNote(id),
    onSuccess: invalidateNotes,
  });
}
