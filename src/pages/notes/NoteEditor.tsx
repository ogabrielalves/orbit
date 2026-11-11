import { useBlocker, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import MoreIcon from "@/assets/icons/linha/mais-opcoes.svg?react";
import type { NoteDetails } from "@/bindings";
import { IconButton } from "@/components/atoms/IconButton";
import { Skeleton } from "@/components/atoms/Skeleton";
import { DropdownMenu } from "@/components/molecules/DropdownMenu";
import { ConfirmDialog } from "@/components/organisms/ConfirmDialog";
import { useDeleteNote, useNotes } from "@/modules/notes/queries";
import { FavoriteToggle } from "@/pages/favorites/FavoriteToggle";
import { LocalGraphPanel } from "@/pages/graph/LocalGraphPanel";
import { SaveIndicator } from "@/pages/notes/editor/SaveIndicator";
import { useNoteAutosave } from "@/pages/notes/editor/useNoteAutosave";
import { useSaveImage } from "@/pages/notes/images/useSaveImage";
import { BacklinksPanel } from "@/pages/notes/links/BacklinksPanel";
import { useWikiLinkNavigation } from "@/pages/notes/links/useWikiLinkNavigation";
import { WikiLinkCreateDialog } from "@/pages/notes/links/WikiLinkCreateDialog";
import { NoteRenameModal } from "@/pages/notes/NoteRenameModal";

const MarkdownEditor = lazy(() =>
  import("@/pages/notes/editor/MarkdownEditor").then((module) => ({
    default: module.MarkdownEditor,
  })),
);

type NoteEditorProps = {
  note: NoteDetails;
  folder: string | undefined;
  onReload: () => Promise<NoteDetails | undefined>;
};

export function NoteEditor({ note, folder, onReload }: NoteEditorProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const deleteNote = useDeleteNote();
  const autosave = useNoteAutosave(note);
  const notesQuery = useNotes({});
  const linkNavigation = useWikiLinkNavigation(folder);
  const saveImage = useSaveImage(note.id);
  const [isConflictDismissed, setIsConflictDismissed] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const { status } = autosave;
  const hasFailed = status === "error";
  const isInConflict = status === "conflict";
  const isSaved = status === "saved";
  const shouldBlockNavigation = hasFailed || isInConflict;
  const isConflictDialogOpen = isInConflict && !isConflictDismissed;

  const blocker = useBlocker({
    shouldBlockFn: () => shouldBlockNavigation,
    enableBeforeUnload: !isSaved,
    withResolver: true,
  });
  const isLeaveDialogOpen = blocker.status === "blocked";
  const { missingTarget } = linkNavigation;
  const isCreatePromptOpen = missingTarget !== null;

  async function handleReload() {
    const fresh = await onReload();
    const hasFresh = fresh !== undefined;
    if (hasFresh) {
      autosave.adopt(fresh);
      setIsConflictDismissed(false);
    }
  }

  async function handleOverwrite() {
    const wasSaved = await autosave.overwrite();
    if (wasSaved) {
      setIsConflictDismissed(false);
    }
  }

  async function handleRetryFromLeaveDialog() {
    const wasSaved = await autosave.saveNow();
    const canLeave = wasSaved && blocker.status === "blocked";
    if (canLeave) {
      blocker.proceed();
      return;
    }
    if (blocker.status === "blocked") {
      blocker.reset();
    }
  }

  function handleLeaveWithoutSaving() {
    autosave.discard();
    if (blocker.status === "blocked") {
      blocker.proceed();
    }
  }

  function handleDelete() {
    deleteNote.mutate(note.id, {
      onSuccess: () => {
        toast.success(t("notes.editor.toast.deleted"));
        autosave.discard();
        setIsDeleting(false);
        void navigate({ to: "/notes", search: { folder } });
      },
    });
  }

  const menuSections = [
    [
      { id: "rename", label: t("notes.editor.menu.rename"), onSelect: () => setIsRenaming(true) },
      {
        id: "delete",
        label: t("notes.editor.menu.delete"),
        isDanger: true,
        onSelect: () => setIsDeleting(true),
      },
    ],
  ];

  return (
    <article aria-label={note.title} className="flex min-h-0 flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <h2 className="truncate font-display text-heading-2 font-semibold text-fg">
            {note.title}
          </h2>
          <span className="truncate text-caption text-fg-muted">{note.path}</span>
        </div>
        <div className="flex items-center gap-2">
          <SaveIndicator
            status={status}
            onRetry={() => void autosave.saveNow()}
            onResolve={() => setIsConflictDismissed(false)}
          />
          <FavoriteToggle entityType="note" entityId={note.id} name={note.title} />
          <DropdownMenu
            trigger={
              <IconButton icon={MoreIcon} size="sm" label={t("notes.editor.menu.actions")} />
            }
            sections={menuSections}
          />
        </div>
      </header>
      <Suspense fallback={<Skeleton className="h-60 w-full" />}>
        <MarkdownEditor
          key={autosave.editorVersion}
          initialValue={autosave.initialContent}
          onChange={autosave.handleChange}
          notes={notesQuery.data}
          onSaveImage={saveImage}
          onNavigateLink={(target) => void linkNavigation.openLink(target)}
        />
      </Suspense>
      <BacklinksPanel noteId={note.id} folder={folder} onCreateLink={linkNavigation.offerCreate} />
      <LocalGraphPanel noteId={note.id} folder={folder} />
      {isConflictDialogOpen && (
        <ConfirmDialog
          isOpen
          tone="danger"
          title={t("notes.editor.conflict.title")}
          description={t("notes.editor.conflict.description")}
          confirmLabel={t("notes.editor.conflict.overwrite")}
          secondaryAction={{
            label: t("notes.editor.conflict.reload"),
            onSelect: () => void handleReload(),
          }}
          onConfirm={() => void handleOverwrite()}
          onCancel={() => setIsConflictDismissed(true)}
        />
      )}
      {isLeaveDialogOpen && (
        <ConfirmDialog
          isOpen
          tone="danger"
          title={t("notes.editor.leave.title")}
          description={t("notes.editor.leave.description")}
          confirmLabel={t("notes.editor.leave.discard")}
          secondaryAction={{
            label: t("notes.editor.leave.retry"),
            onSelect: () => void handleRetryFromLeaveDialog(),
          }}
          onConfirm={handleLeaveWithoutSaving}
          onCancel={() => blocker.reset?.()}
        />
      )}
      {isCreatePromptOpen && (
        <WikiLinkCreateDialog
          target={missingTarget}
          folder={folder}
          onClose={linkNavigation.closeCreate}
        />
      )}
      {isRenaming && (
        <NoteRenameModal noteId={note.id} title={note.title} onClose={() => setIsRenaming(false)} />
      )}
      {isDeleting && (
        <ConfirmDialog
          isOpen
          tone="danger"
          title={t("notes.editor.delete.title", { name: note.title })}
          description={t("notes.editor.delete.description")}
          confirmLabel={t("notes.editor.delete.confirm")}
          isConfirming={deleteNote.isPending}
          onConfirm={handleDelete}
          onCancel={() => setIsDeleting(false)}
        />
      )}
    </article>
  );
}
