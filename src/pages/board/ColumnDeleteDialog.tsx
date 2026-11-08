import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { BoardColumn } from "@/bindings";
import { ConfirmDialog } from "@/components/organisms/ConfirmDialog";
import { useDeleteColumn } from "@/modules/boards/queries";

type ColumnDeleteDialogProps = {
  boardId: string;
  column: BoardColumn;
  onClose: () => void;
};

export function ColumnDeleteDialog({ boardId, column, onClose }: ColumnDeleteDialogProps) {
  const { t } = useTranslation();
  const deleteColumn = useDeleteColumn(boardId);

  const hasTasks = column.taskCount > 0;
  const values = { name: column.name, count: column.taskCount };
  const title = hasTasks
    ? t("boards.confirm.blockedTitle", values)
    : t("boards.confirm.deleteColumnTitle", values);
  const description = hasTasks
    ? t("boards.confirm.blockedDescription", values)
    : t("boards.confirm.deleteColumnDescription");

  function handleConfirm() {
    deleteColumn.mutate(column.id, {
      onSuccess: () => {
        toast.success(t("boards.toast.columnDeleted"));
        onClose();
      },
    });
  }

  return (
    <ConfirmDialog
      isOpen
      tone="danger"
      title={title}
      description={description}
      confirmLabel={t("boards.confirm.deleteColumnConfirm")}
      isConfirmDisabled={hasTasks}
      isConfirming={deleteColumn.isPending}
      onConfirm={handleConfirm}
      onCancel={onClose}
    />
  );
}
