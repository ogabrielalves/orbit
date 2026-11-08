import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Board } from "@/bindings";
import { ConfirmDialog } from "@/components/organisms/ConfirmDialog";
import { useDeleteBoard } from "@/modules/boards/queries";

type BoardDeleteDialogProps = {
  board: Board;
  onDeleted: () => void;
  onClose: () => void;
};

export function BoardDeleteDialog({ board, onDeleted, onClose }: BoardDeleteDialogProps) {
  const { t } = useTranslation();
  const deleteBoard = useDeleteBoard();

  function handleConfirm() {
    deleteBoard.mutate(board.id, {
      onSuccess: () => {
        toast.success(t("boards.toast.boardDeleted"));
        onDeleted();
        onClose();
      },
    });
  }

  return (
    <ConfirmDialog
      isOpen
      tone="danger"
      title={t("boards.confirm.deleteBoardTitle", { name: board.name })}
      description={t("boards.confirm.deleteBoardDescription")}
      confirmLabel={t("boards.confirm.deleteBoardConfirm")}
      isConfirming={deleteBoard.isPending}
      onConfirm={handleConfirm}
      onCancel={onClose}
    />
  );
}
