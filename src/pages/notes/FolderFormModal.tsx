import { type FormEvent, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { FolderEntry } from "@/bindings";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { FormField } from "@/components/molecules/FormField";
import { Modal } from "@/components/organisms/Modal";
import { useCreateFolder, useRenameFolder } from "@/modules/folders/queries";

export type FolderFormTarget =
  | { kind: "create"; parentPath: string | null }
  | { kind: "rename"; folder: FolderEntry };

type FolderFormModalProps = {
  target: FolderFormTarget;
  onClose: () => void;
  onCreated: (folder: FolderEntry) => void;
  onRenamed: (previousPath: string, folder: FolderEntry) => void;
};

export function FolderFormModal({ target, onClose, onCreated, onRenamed }: FolderFormModalProps) {
  const { t } = useTranslation();
  const formId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const createFolder = useCreateFolder();
  const renameFolder = useRenameFolder();

  const isRenaming = target.kind === "rename";
  const [name, setName] = useState(isRenaming ? target.folder.name : "");

  const isNameBlank = name.trim() === "";
  const isSaving = createFolder.isPending || renameFolder.isPending;
  const titleKey = isRenaming ? "notes.folders.form.renameTitle" : "notes.folders.form.createTitle";
  const submitKey = isRenaming ? "notes.folders.form.rename" : "notes.folders.form.create";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isNameBlank) {
      return;
    }

    const trimmedName = name.trim();
    if (target.kind === "rename") {
      const previousPath = target.folder.path;
      renameFolder.mutate(
        { path: previousPath, newName: trimmedName },
        {
          onSuccess: (folder) => {
            toast.success(t("notes.folders.toast.renamed"));
            onRenamed(previousPath, folder);
            onClose();
          },
        },
      );
      return;
    }

    createFolder.mutate(
      { parentPath: target.parentPath, name: trimmedName },
      {
        onSuccess: (folder) => {
          toast.success(t("notes.folders.toast.created"));
          onCreated(folder);
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
      title={t(titleKey)}
      closeLabel={t("common.close")}
      initialFocusRef={nameInputRef}
      footer={
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form={formId} disabled={isNameBlank} isLoading={isSaving}>
            {t(submitKey)}
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4.5 p-6">
        <FormField label={t("notes.folders.form.nameLabel")}>
          {({ id, "aria-describedby": describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              ref={nameInputRef}
              value={name}
              placeholder={t("notes.folders.form.namePlaceholder")}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </FormField>
      </form>
    </Modal>
  );
}
