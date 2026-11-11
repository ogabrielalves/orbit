import { DndContext, DragOverlay } from "@dnd-kit/core";
import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/atoms/Skeleton";
import { ErrorState } from "@/components/molecules/ErrorState";
import { getErrorMessageKey } from "@/lib/appError";
import { useFolders } from "@/modules/folders/queries";
import { FolderDeleteDialog } from "@/pages/notes/FolderDeleteDialog";
import { FolderFormModal, type FolderFormTarget } from "@/pages/notes/FolderFormModal";
import { FolderTree } from "@/pages/notes/FolderTree";
import {
  buildFolderTree,
  type FolderNode,
  findFolderNode,
  isPathInside,
} from "@/pages/notes/folderModel";
import { NoteCreateModal } from "@/pages/notes/NoteCreateModal";
import { NotePane } from "@/pages/notes/NotePane";
import { NotesList } from "@/pages/notes/NotesList";
import { useNoteMoveDnd } from "@/pages/notes/useNoteMoveDnd";

type NoteFormState = { folderPath: string | null } | null;

export function NotesWorkspace() {
  const { t, i18n } = useTranslation();
  const { noteId } = useParams({ strict: false });
  const { folder, new: newParam } = useSearch({ strict: false });
  const navigate = useNavigate();
  const foldersQuery = useFolders();
  const [folderForm, setFolderForm] = useState<FolderFormTarget | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<FolderNode | null>(null);
  const [noteForm, setNoteForm] = useState<NoteFormState>(null);

  const selectedPath = folder ?? "";
  const roots = buildFolderTree(foldersQuery.data ?? [], i18n.language);
  const selectedNode = findFolderNode(roots, selectedPath);
  const selectedName = selectedNode?.entry.name ?? null;
  const isLoading = foldersQuery.isPending;
  const hasFailed = foldersQuery.isError;
  const hasFolderForm = folderForm !== null;
  const hasNoteForm = noteForm !== null;
  const hasFolderToDelete = folderToDelete !== null;
  const moveDnd = useNoteMoveDnd({ selectedPath, onSelectedPathChange: selectFolder });
  const activeName = moveDnd.activeSource?.name;
  const hasActiveSource = activeName !== undefined;
  const isNewRequested = newParam === 1;

  useEffect(() => {
    if (!isNewRequested) {
      return;
    }
    setNoteForm({ folderPath: folder ?? null });
    void navigate({
      to: ".",
      search: (previous) => ({ ...previous, new: undefined }),
      replace: true,
    });
  }, [isNewRequested, folder, navigate]);

  function selectFolder(path: string) {
    void navigate({ to: "/notes", search: { folder: path === "" ? undefined : path } });
  }

  function handleFolderRenamed(previousPath: string, renamed: { path: string }) {
    const isSelectedInside = isPathInside(selectedPath, previousPath);
    if (isSelectedInside) {
      selectFolder(renamed.path + selectedPath.slice(previousPath.length));
    }
  }

  function handleFolderDeleted(path: string) {
    const isSelectedInside = isPathInside(selectedPath, path);
    if (isSelectedInside) {
      selectFolder("");
    }
  }

  function openCreatedNote(createdNoteId: string) {
    void navigate({
      to: "/notes/$noteId",
      params: { noteId: createdNoteId },
      search: { folder },
    });
  }

  return (
    <DndContext
      sensors={moveDnd.sensors}
      onDragStart={moveDnd.onDragStart}
      onDragEnd={moveDnd.onDragEnd}
      onDragCancel={moveDnd.onDragCancel}
      accessibility={{
        announcements: moveDnd.announcements,
        screenReaderInstructions: { draggable: moveDnd.instructions },
      }}
    >
      <div className="grid gap-4 lg:grid-cols-[15rem_20rem_minmax(0,1fr)]">
        <div className="rounded-xl border border-border bg-surface p-3">
          {isLoading && (
            <div role="status" aria-busy="true" className="flex flex-col gap-2">
              <span className="sr-only">{t("common.loading")}</span>
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          )}
          {hasFailed && (
            <ErrorState
              title={t("notes.folders.loadError")}
              description={t(getErrorMessageKey(foldersQuery.error))}
              onRetry={() => void foldersQuery.refetch()}
            />
          )}
          {foldersQuery.isSuccess && (
            <FolderTree
              roots={roots}
              selectedPath={selectedPath}
              onSelect={selectFolder}
              onNewFolder={(parentPath) => setFolderForm({ kind: "create", parentPath })}
              onNewNote={(folderPath) => setNoteForm({ folderPath })}
              onRename={(node) => setFolderForm({ kind: "rename", folder: node.entry })}
              onDelete={setFolderToDelete}
            />
          )}
        </div>
        <NotesList
          folderPath={selectedPath}
          folderName={selectedName}
          selectedNoteId={noteId}
          onNewNote={() => setNoteForm({ folderPath: selectedPath === "" ? null : selectedPath })}
        />
        <div className="min-w-0 rounded-xl border border-border bg-surface p-5">
          <NotePane noteId={noteId} folder={folder} />
        </div>
        {hasFolderForm && (
          <FolderFormModal
            target={folderForm}
            onClose={() => setFolderForm(null)}
            onCreated={(created) => selectFolder(created.path)}
            onRenamed={handleFolderRenamed}
          />
        )}
        {hasFolderToDelete && (
          <FolderDeleteDialog
            node={folderToDelete}
            onClose={() => setFolderToDelete(null)}
            onDeleted={handleFolderDeleted}
          />
        )}
        {hasNoteForm && (
          <NoteCreateModal
            folderPath={noteForm.folderPath}
            onClose={() => setNoteForm(null)}
            onCreated={(created) => openCreatedNote(created.id)}
          />
        )}
      </div>
      <DragOverlay>
        {hasActiveSource && (
          <div className="rounded-lg border border-primary-border bg-surface px-3 py-1.5 text-small text-fg shadow-md">
            {activeName}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
