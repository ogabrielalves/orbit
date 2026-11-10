import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import PlusIcon from "@/assets/icons/linha/mais.svg?react";
import { Button } from "@/components/atoms/Button";
import { Skeleton } from "@/components/atoms/Skeleton";
import { EmptyState } from "@/components/molecules/EmptyState";
import { ErrorState } from "@/components/molecules/ErrorState";
import { getErrorMessageKey } from "@/lib/appError";
import { formatRelativeTime } from "@/lib/dates";
import { useNotes } from "@/modules/notes/queries";

type NotesListProps = {
  folderPath: string;
  folderName: string | null;
  selectedNoteId: string | undefined;
  onNewNote: () => void;
};

const placeholderIds = ["a", "b", "c", "d"];

export function NotesList({ folderPath, folderName, selectedNoteId, onNewNote }: NotesListProps) {
  const { t, i18n } = useTranslation();
  const isAllNotes = folderPath === "";
  const notesQuery = useNotes(isAllNotes ? {} : { folderPath, includeSubfolders: false });

  const notes = notesQuery.data ?? [];
  const isLoading = notesQuery.isPending;
  const hasFailed = notesQuery.isError;
  const hasNotes = notes.length > 0;
  const hasNoNotes = notesQuery.isSuccess && !hasNotes;
  const heading = folderName ?? t("notes.folders.all");
  const folderSearch = isAllNotes ? undefined : folderPath;

  return (
    <section aria-label={t("notes.list.title")} className="flex min-w-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="truncate text-heading-3 font-semibold text-fg">{heading}</h2>
        <Button size="sm" icon={PlusIcon} onClick={onNewNote}>
          {t("notes.list.newNote")}
        </Button>
      </div>
      {isLoading && (
        <div role="status" aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">{t("common.loading")}</span>
          {placeholderIds.map((id) => (
            <Skeleton key={id} className="h-14 w-full" />
          ))}
        </div>
      )}
      {hasFailed && (
        <ErrorState
          title={t("notes.list.loadError")}
          description={t(getErrorMessageKey(notesQuery.error))}
          onRetry={() => void notesQuery.refetch()}
        />
      )}
      {hasNoNotes && (
        <EmptyState
          title={t("notes.list.empty.title")}
          description={t("notes.list.empty.description")}
        />
      )}
      {hasNotes && (
        <ul aria-label={t("notes.list.title")} className="flex flex-col gap-1.5">
          {notes.map((note) => {
            const isSelected = note.id === selectedNoteId;
            const itemClass = isSelected
              ? "border-primary-border bg-primary-soft"
              : "border-border bg-surface hover:bg-surface-muted";

            return (
              <li key={note.id}>
                <Link
                  to="/notes/$noteId"
                  params={{ noteId: note.id }}
                  search={{ folder: folderSearch }}
                  aria-current={isSelected ? "page" : undefined}
                  className={`flex flex-col gap-0.5 rounded-lg border px-3 py-2.5 ${itemClass}`}
                >
                  <span className="truncate text-small font-medium text-fg">{note.title}</span>
                  <span className="truncate text-caption text-fg-muted">
                    {isAllNotes ? `${note.path} · ` : ""}
                    {formatRelativeTime(new Date(note.modifiedAt), new Date(), i18n.language)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
