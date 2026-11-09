import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Task } from "@/bindings";
import { ConfirmDialog } from "@/components/organisms/ConfirmDialog";
import { useDeleteTask } from "@/modules/tasks/queries";

type TaskDeleteDialogProps = {
  task: Task;
  onClose: () => void;
  onDeleted: () => void;
};

export function TaskDeleteDialog({ task, onClose, onDeleted }: TaskDeleteDialogProps) {
  const { t } = useTranslation();
  const deleteTask = useDeleteTask();

  function handleConfirm() {
    deleteTask.mutate(task.id, {
      onSuccess: () => {
        toast.success(t("tasks.detail.toast.deleted"));
        onDeleted();
      },
    });
  }

  return (
    <ConfirmDialog
      isOpen
      tone="danger"
      title={t("tasks.detail.confirm.deleteTitle", { title: task.title })}
      description={t("tasks.detail.confirm.deleteDescription")}
      confirmLabel={t("tasks.detail.confirm.deleteConfirm")}
      isConfirming={deleteTask.isPending}
      onConfirm={handleConfirm}
      onCancel={onClose}
    />
  );
}
