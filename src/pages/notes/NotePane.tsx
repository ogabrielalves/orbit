import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/atoms/Skeleton";
import { EmptyState } from "@/components/molecules/EmptyState";
import { ErrorState } from "@/components/molecules/ErrorState";
import { getErrorMessageKey } from "@/lib/appError";
import { useNote } from "@/modules/notes/queries";

type NotePaneProps = {
  noteId: string | undefined;
};

export function NotePane({ noteId }: NotePaneProps) {
  const { t } = useTranslation();
  const hasNote = noteId !== undefined;
  const noteQuery = useNote(noteId ?? "", hasNote);

  if (!hasNote) {
    return (
      <EmptyState
        title={t("notes.pane.empty.title")}
        description={t("notes.pane.empty.description")}
      />
    );
  }

  if (noteQuery.isPending) {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-3">
        <span className="sr-only">{t("common.loading")}</span>
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (noteQuery.isError) {
    return (
      <ErrorState
        title={t("notes.pane.loadError")}
        description={t(getErrorMessageKey(noteQuery.error))}
        onRetry={() => void noteQuery.refetch()}
      />
    );
  }

  return (
    <article aria-label={noteQuery.data.title} className="flex flex-col gap-1">
      <h2 className="font-display text-heading-2 font-semibold text-fg">{noteQuery.data.title}</h2>
      <span className="text-caption text-fg-muted">{noteQuery.data.path}</span>
    </article>
  );
}
