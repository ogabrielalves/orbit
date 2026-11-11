import { useMutation, useQueryClient } from "@tanstack/react-query";
import { exportDatabase, importDatabase } from "@/modules/backup/api";

export function useExportDatabase() {
  return useMutation({ mutationFn: exportDatabase });
}

export function useImportDatabase() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: importDatabase,
    onSuccess: () => queryClient.invalidateQueries(),
  });
}
