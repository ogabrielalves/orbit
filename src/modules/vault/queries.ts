import { useMutation, useQueryClient } from "@tanstack/react-query";
import { folderKeys } from "@/modules/folders/queries";
import { noteLinksKeys } from "@/modules/notes/linksQueries";
import { noteKeys, vaultKeys } from "@/modules/notes/queries";
import { reindexVault } from "@/modules/vault/api";

export function useReindexVault() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: reindexVault,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: vaultKeys.status }),
        queryClient.invalidateQueries({ queryKey: noteKeys.all }),
        queryClient.invalidateQueries({ queryKey: noteLinksKeys.all }),
        queryClient.invalidateQueries({ queryKey: folderKeys.all }),
      ]),
  });
}
