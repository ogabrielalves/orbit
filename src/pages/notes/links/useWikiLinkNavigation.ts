import { useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getErrorMessageKey } from "@/lib/appError";
import { resolveNoteLink } from "@/modules/notes/linksApi";

export function useWikiLinkNavigation(folder: string | undefined) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [missingTarget, setMissingTarget] = useState<string | null>(null);

  const openLink = useCallback(
    async (target: string) => {
      try {
        const note = await resolveNoteLink(target);
        const hasNote = note !== null;
        if (hasNote) {
          await navigate({ to: "/notes/$noteId", params: { noteId: note.id }, search: { folder } });
          return;
        }
        setMissingTarget(target);
      } catch (error) {
        toast.error(t("notes.links.resolveError"), {
          description: t(getErrorMessageKey(error)),
        });
      }
    },
    [folder, navigate, t],
  );

  const offerCreate = useCallback((target: string) => setMissingTarget(target), []);
  const closeCreate = useCallback(() => setMissingTarget(null), []);

  return { openLink, offerCreate, closeCreate, missingTarget };
}
