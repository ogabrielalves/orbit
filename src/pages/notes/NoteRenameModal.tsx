import { type FormEvent, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { FormField } from "@/components/molecules/FormField";
import { Modal } from "@/components/organisms/Modal";
import { useRenameNote } from "@/modules/notes/queries";

type NoteRenameModalProps = {
  noteId: string;
  title: string;
  onClose: () => void;
};

export function NoteRenameModal({ noteId, title, onClose }: NoteRenameModalProps) {
  const { t } = useTranslation();
  const formId = useId();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const renameNote = useRenameNote();
  const [newTitle, setNewTitle] = useState(title);

  const isBlank = newTitle.trim() === "";
  const isUnchanged = newTitle.trim() === title;
  const canSave = !isBlank && !isUnchanged;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) {
      return;
    }

    renameNote.mutate(
      { id: noteId, newTitle: newTitle.trim() },
      {
        onSuccess: (result) => {
          toast.success(t("notes.editor.toast.renamed", { count: result.rewrittenNotes }));
          onClose();
        },
      },
    );
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="sm"
      title={t("notes.editor.rename.title")}
      closeLabel={t("common.close")}
      initialFocusRef={titleInputRef}
      footer={
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form={formId} disabled={!canSave} isLoading={renameNote.isPending}>
            {t("notes.editor.rename.confirm")}
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4.5 p-6">
        <FormField label={t("notes.editor.rename.label")} hint={t("notes.editor.rename.hint")}>
          {({ id, "aria-describedby": describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              ref={titleInputRef}
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
            />
          )}
        </FormField>
      </form>
    </Modal>
  );
}
