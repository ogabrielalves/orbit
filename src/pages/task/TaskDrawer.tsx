import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import MoreIcon from "@/assets/icons/linha/mais-opcoes.svg?react";
import type { Task } from "@/bindings";
import { IconButton } from "@/components/atoms/IconButton";
import { Skeleton } from "@/components/atoms/Skeleton";
import { DropdownMenu } from "@/components/molecules/DropdownMenu";
import { ErrorState } from "@/components/molecules/ErrorState";
import { Drawer } from "@/components/organisms/Drawer";
import { getErrorMessageKey } from "@/lib/appError";
import { buildCopyTitle } from "@/modules/tasks/form";
import { useArchiveTask, useDuplicateTask, useRestoreTask, useTask } from "@/modules/tasks/queries";
import { TaskChecklist } from "@/pages/task/TaskChecklist";
import { TaskComments } from "@/pages/task/TaskComments";
import { TaskDeleteDialog } from "@/pages/task/TaskDeleteDialog";
import { TaskDetailsForm } from "@/pages/task/TaskDetailsForm";
import { TaskSubtasks } from "@/pages/task/TaskSubtasks";
import { TaskTags } from "@/pages/task/TaskTags";

type TaskDrawerProps = {
  taskId: string;
  onClose: () => void;
};

export function TaskDrawer({ taskId, onClose }: TaskDrawerProps) {
  const { t } = useTranslation();
  const taskQuery = useTask(taskId);
  const archiveTask = useArchiveTask();
  const restoreTask = useRestoreTask();
  const duplicateTask = useDuplicateTask();
  const [isDeleting, setIsDeleting] = useState(false);

  const task = taskQuery.data;
  const isLoading = taskQuery.isPending;
  const hasFailed = taskQuery.isError;
  const hasTask = task !== undefined;
  const isArchived = hasTask && task.archivedAt !== null;
  const showDeleteDialog = hasTask && isDeleting;
  const canHaveSubtasks = hasTask && task.parentTaskId === null;

  function handleDuplicate(source: Task) {
    const title = buildCopyTitle(source.title, (value) =>
      t("tasks.detail.copyTitle", { title: value }),
    );
    duplicateTask.mutate(
      { id: source.id, title },
      { onSuccess: () => toast.success(t("tasks.detail.toast.duplicated")) },
    );
  }

  function handleArchive(source: Task) {
    archiveTask.mutate(source.id, {
      onSuccess: () => toast.success(t("tasks.detail.toast.archived")),
    });
  }

  function handleRestore(source: Task) {
    restoreTask.mutate(source.id, {
      onSuccess: () => toast.success(t("tasks.detail.toast.restored")),
    });
  }

  const actionsMenu = hasTask ? (
    <DropdownMenu
      trigger={<IconButton icon={MoreIcon} label={t("tasks.detail.actions")} />}
      sections={[
        [
          {
            id: "duplicate",
            label: t("tasks.detail.duplicate"),
            onSelect: () => handleDuplicate(task),
          },
          isArchived
            ? {
                id: "restore",
                label: t("tasks.detail.restore"),
                onSelect: () => handleRestore(task),
              }
            : {
                id: "archive",
                label: t("tasks.detail.archive"),
                onSelect: () => handleArchive(task),
              },
        ],
        [
          {
            id: "delete",
            label: t("tasks.detail.delete"),
            isDanger: true,
            onSelect: () => setIsDeleting(true),
          },
        ],
      ]}
    />
  ) : undefined;

  return (
    <>
      <Drawer
        isOpen
        onClose={onClose}
        title={t("tasks.detail.title")}
        closeLabel={t("common.close")}
        headerActions={actionsMenu}
      >
        {isLoading && (
          <div role="status" aria-busy="true" className="flex flex-col gap-4 p-6">
            <span className="sr-only">{t("common.loading")}</span>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-10 w-1/2" />
          </div>
        )}
        {hasFailed && (
          <div className="p-6">
            <ErrorState
              title={t("tasks.detail.loadError")}
              description={t(getErrorMessageKey(taskQuery.error))}
              onRetry={() => void taskQuery.refetch()}
            />
          </div>
        )}
        {hasTask && (
          <>
            {isArchived && (
              <p className="border-b border-border bg-warning-soft px-6 py-3 text-small text-warning-fg">
                {t("tasks.detail.archivedNotice")}
              </p>
            )}
            <TaskDetailsForm key={task.id} task={task} />
            <div className="flex flex-col gap-6 border-t border-border p-6">
              {canHaveSubtasks && <TaskSubtasks taskId={task.id} />}
              <TaskChecklist taskId={task.id} />
              <TaskTags taskId={task.id} />
              <TaskComments taskId={task.id} />
            </div>
          </>
        )}
      </Drawer>
      {showDeleteDialog && (
        <TaskDeleteDialog task={task} onClose={() => setIsDeleting(false)} onDeleted={onClose} />
      )}
    </>
  );
}
