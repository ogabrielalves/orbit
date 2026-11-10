import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/organisms/ConfirmDialog";
import { useDeleteFolder } from "@/modules/folders/queries";
import { countNotesDeep, type FolderNode, isFolderEmpty } from "@/pages/notes/folderModel";

type FolderDeleteDialogProps = {
  node: FolderNode;
  onClose: () => void;
  onDeleted: (path: string) => void;
};

export function FolderDeleteDialog({ node, onClose, onDeleted }: FolderDeleteDialogProps) {
  const { t } = useTranslation();
  const deleteFolder = useDeleteFolder();

  const { name, path } = node.entry;
  const isEmpty = isFolderEmpty(node);
  const notes = countNotesDeep(node);

  function handleConfirm() {
    deleteFolder.mutate(
      { path, recursive: !isEmpty },
      {
        onSuccess: () => {
          toast.success(t("notes.folders.toast.deleted"));
          onDeleted(path);
          onClose();
        },
      },
    );
  }

  if (isEmpty) {
    return (
      <ConfirmDialog
        isOpen
        tone="danger"
        title={t("notes.folders.confirm.emptyTitle", { name })}
        description={t("notes.folders.confirm.emptyDescription")}
        confirmLabel={t("notes.folders.confirm.confirm")}
        isConfirming={deleteFolder.isPending}
        onConfirm={handleConfirm}
        onCancel={onClose}
      />
    );
  }

  return (
    <ConfirmDialog
      isOpen
      tone="danger"
      title={t("notes.folders.confirm.recursiveTitle", { name })}
      description={t("notes.folders.confirm.recursiveDescription", { count: notes })}
      confirmLabel={t("notes.folders.confirm.recursiveConfirm")}
      confirmationText={name}
      isConfirming={deleteFolder.isPending}
      onConfirm={handleConfirm}
      onCancel={onClose}
    />
  );
}
