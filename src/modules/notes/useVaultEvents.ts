import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { events } from "@/bindings";
import { folderKeys } from "@/modules/folders/queries";
import { noteKeys } from "@/modules/notes/queries";

export function useVaultEvents() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let isActive = true;
    let unlisten: (() => void) | undefined;

    void events.vaultChanged
      .listen(() => {
        void queryClient.invalidateQueries({ queryKey: noteKeys.all });
        void queryClient.invalidateQueries({ queryKey: folderKeys.all });
      })
      .then((stop) => {
        if (isActive) {
          unlisten = stop;
          return;
        }
        stop();
      })
      .catch(() => undefined);

    return () => {
      isActive = false;
      unlisten?.();
    };
  }, [queryClient]);
}
