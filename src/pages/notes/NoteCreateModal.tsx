import { type FormEvent, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { NoteDetails } from "@/bindings";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { FormField } from "@/components/molecules/FormField";
import { Modal } from "@/components/organisms/Modal";
import { useCreateNote } from "@/modules/notes/queries";

type NoteCreateModalProps = {
  folderPath: string | null;
  onClose: () => void;
  onCreated: (note: NoteDetails) => void;
};

export function NoteCreateModal({ folderPath, onClose, onCreated }: NoteCreateModalProps) {
  const { t } = useTranslation();
  const formId = useId();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const createNote = useCreateNote();
  const [title, setTitle] = useState("");

  const isTitleBlank = title.trim() === "";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isTitleBlank) {
      return;
    }

    createNote.mutate(
      { title: title.trim(), folderPath },
      {
        onSuccess: (note) => {
          toast.success(t("notes.list.toast.created"));
          onCreated(note);
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
      title={t("notes.list.form.title")}
      closeLabel={t("common.close")}
      initialFocusRef={titleInputRef}
      footer={
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={isTitleBlank}
            isLoading={createNote.isPending}
          >
            {t("notes.list.form.create")}
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4.5 p-6">
        <FormField label={t("notes.list.form.titleLabel")}>
          {({ id, "aria-describedby": describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              ref={titleInputRef}
              value={title}
              placeholder={t("notes.list.form.titlePlaceholder")}
              onChange={(event) => setTitle(event.target.value)}
            />
          )}
        </FormField>
      </form>
    </Modal>
  );
}
