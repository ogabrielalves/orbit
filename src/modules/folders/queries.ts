import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { activityKeys } from "@/modules/activity/queries";
import {
  createFolder,
  deleteFolder,
  fetchFolders,
  moveFolder,
  renameFolder,
} from "@/modules/folders/api";

export const folderKeys = {
  all: ["folders"] as const,
};

type RenameFolderVariables = { path: string; newName: string };
type MoveFolderVariables = { path: string; newParentPath: string | null };
type DeleteFolderVariables = { path: string; recursive: boolean };

export function useFolders(isEnabled = true) {
  return useQuery({ queryKey: folderKeys.all, queryFn: fetchFolders, enabled: isEnabled });
}

function useInvalidateFolders() {
  const queryClient = useQueryClient();

  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: folderKeys.all }),
      queryClient.invalidateQueries({ queryKey: ["notes"] }),
      queryClient.invalidateQueries({ queryKey: activityKeys.all }),
    ]);
}

export function useCreateFolder() {
  const invalidateFolders = useInvalidateFolders();

  return useMutation({ mutationFn: createFolder, onSuccess: invalidateFolders });
}

export function useRenameFolder() {
  const invalidateFolders = useInvalidateFolders();

  return useMutation({
    mutationFn: ({ path, newName }: RenameFolderVariables) => renameFolder(path, newName),
    onSuccess: invalidateFolders,
  });
}

export function useMoveFolder() {
  const invalidateFolders = useInvalidateFolders();

  return useMutation({
    mutationFn: ({ path, newParentPath }: MoveFolderVariables) => moveFolder(path, newParentPath),
    onSuccess: invalidateFolders,
  });
}

export function useDeleteFolder() {
  const invalidateFolders = useInvalidateFolders();

  return useMutation({
    mutationFn: ({ path, recursive }: DeleteFolderVariables) => deleteFolder(path, recursive),
    onSuccess: invalidateFolders,
  });
}
