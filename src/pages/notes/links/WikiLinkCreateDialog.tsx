import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/organisms/ConfirmDialog";
import { useCreateNote } from "@/modules/notes/queries";

type WikiLinkCreateDialogProps = {
  target: string;
  folder: string | undefined;
  onClose: () => void;
};

export function WikiLinkCreateDialog({ target, folder, onClose }: WikiLinkCreateDialogProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createNote = useCreateNote();

  function handleConfirm() {
    createNote.mutate(
      { title: target, folderPath: null },
      {
        onSuccess: (note) => {
          toast.success(t("notes.links.create.created"));
          onClose();
          void navigate({ to: "/notes/$noteId", params: { noteId: note.id }, search: { folder } });
        },
      },
    );
  }

  return (
    <ConfirmDialog
      isOpen
      title={t("notes.links.create.title", { name: target })}
      description={t("notes.links.create.description")}
      confirmLabel={t("notes.links.create.confirm")}
      isConfirming={createNote.isPending}
      onConfirm={handleConfirm}
      onCancel={onClose}
    />
  );
}
