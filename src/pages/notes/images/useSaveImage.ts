import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getErrorMessageKey } from "@/lib/appError";
import { savePastedImage } from "@/modules/notes/imageApi";

export function useSaveImage(noteId: string) {
  const { t } = useTranslation();

  return useCallback(
    async (data: number[]) => {
      try {
        const pasted = await savePastedImage(noteId, data);
        return pasted.markdown;
      } catch (error) {
        toast.error(t("notes.images.saveError"), { description: t(getErrorMessageKey(error)) });
        return null;
      }
    },
    [noteId, t],
  );
}
