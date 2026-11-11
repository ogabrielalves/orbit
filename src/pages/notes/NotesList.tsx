import { useDndContext, useDraggable } from "@dnd-kit/core";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import PlusIcon from "@/assets/icons/linha/mais.svg?react";
import type { NoteSummary } from "@/bindings";
import { Button } from "@/components/atoms/Button";
import { Skeleton } from "@/components/atoms/Skeleton";
import { EmptyState } from "@/components/molecules/EmptyState";
import { ErrorState } from "@/components/molecules/ErrorState";
import { LIST_PRIMARY_ATTRIBUTE, VirtualList } from "@/components/organisms/VirtualList";
import { getErrorMessageKey } from "@/lib/appError";
import { formatRelativeTime } from "@/lib/dates";
import { useNotes } from "@/modules/notes/queries";
import { DragHandle } from "@/pages/notes/DragHandle";
import { type DragSource, NOTE_DRAG_PREFIX, parentFolderOf } from "@/pages/notes/noteMove";

type NotesListProps = {
  folderPath: string;
  folderName: string | null;
  selectedNoteId: string | undefined;
  onNewNote: () => void;
};

const placeholderIds = ["a", "b", "c", "d"];
const NOTE_ROW_ESTIMATE_IN_PIXELS = 58;
const NOTE_ROW_GAP_IN_PIXELS = 6;
const listPrimaryProps = { [LIST_PRIMARY_ATTRIBUTE]: "" };

type NoteListItemProps = {
  note: NoteSummary;
  isSelected: boolean;
  isAllNotes: boolean;
  folderSearch: string | undefined;
};

function NoteListItem({ note, isSelected, isAllNotes, folderSearch }: NoteListItemProps) {
  const { t, i18n } = useTranslation();
  const drag = useDraggable({
    id: `${NOTE_DRAG_PREFIX}${note.id}`,
    data: {
      kind: "note",
      id: note.id,
      name: note.title,
      folderPath: parentFolderOf(note.path),
    } satisfies DragSource,
  });

  const itemClass = isSelected
    ? "border-primary-border bg-primary-soft"
    : "border-border bg-surface hover:bg-surface-muted";
  const dragClass = drag.isDragging ? "opacity-50" : "";

  return (
    <div ref={drag.setNodeRef} className={`group relative ${dragClass}`}>
      <Link
        to="/notes/$noteId"
        params={{ noteId: note.id }}
        search={{ folder: folderSearch }}
        aria-current={isSelected ? "page" : undefined}
        {...listPrimaryProps}
        className={`flex flex-col gap-0.5 rounded-lg border px-3 py-2.5 pr-9 ${itemClass}`}
      >
        <span className="truncate text-small font-medium text-fg">{note.title}</span>
        <span className="truncate text-caption text-fg-muted">
          {isAllNotes ? `${note.path} · ` : ""}
          {formatRelativeTime(new Date(note.modifiedAt), new Date(), i18n.language)}
        </span>
      </Link>
      <div className="absolute top-1/2 right-1.5 -translate-y-1/2">
        <DragHandle
          label={t("notes.move.handle", { name: note.title })}
          attributes={drag.attributes}
          listeners={drag.listeners}
          setActivatorNodeRef={drag.setActivatorNodeRef}
        />
      </div>
    </div>
  );
}

export function NotesList({ folderPath, folderName, selectedNoteId, onNewNote }: NotesListProps) {
  const { t } = useTranslation();
  const isAllNotes = folderPath === "";
  const notesQuery = useNotes(isAllNotes ? {} : { folderPath, includeSubfolders: false });
  const { active } = useDndContext();
  const activeId = String(active?.id ?? "");
  const pinnedKey = activeId.startsWith(NOTE_DRAG_PREFIX)
    ? activeId.slice(NOTE_DRAG_PREFIX.length)
    : null;

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
        <VirtualList
          items={notes}
          getKey={(note) => note.id}
          estimateSize={NOTE_ROW_ESTIMATE_IN_PIXELS}
          gap={NOTE_ROW_GAP_IN_PIXELS}
          label={t("notes.list.title")}
          scrollClassName="-m-1.5 max-h-96 overflow-y-auto p-1.5 lg:max-h-[calc(100vh-15rem)]"
          pinnedKey={pinnedKey}
          scrollToKey={selectedNoteId ?? null}
          renderItem={(note) => (
            <NoteListItem
              note={note}
              isSelected={note.id === selectedNoteId}
              isAllNotes={isAllNotes}
              folderSearch={folderSearch}
            />
          )}
        />
      )}
    </section>
  );
}
