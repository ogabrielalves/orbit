import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/atoms/Skeleton";
import { EmptyState } from "@/components/molecules/EmptyState";
import { ErrorState } from "@/components/molecules/ErrorState";
import { getErrorMessageKey } from "@/lib/appError";
import { useNote } from "@/modules/notes/queries";
import { NoteEditor } from "@/pages/notes/NoteEditor";

type NotePaneProps = {
  noteId: string | undefined;
  folder: string | undefined;
};

export function NotePane({ noteId, folder }: NotePaneProps) {
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
    <NoteEditor
      key={noteQuery.data.id}
      note={noteQuery.data}
      folder={folder}
      onReload={async () => (await noteQuery.refetch()).data}
    />
  );
}
