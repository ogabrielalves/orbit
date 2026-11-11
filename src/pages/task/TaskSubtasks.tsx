import { useTranslation } from "react-i18next";
import { QueryStatus } from "@/components/molecules/QueryStatus";
import { CheckList, type CheckListEntry } from "@/components/organisms/CheckList";
import { TASK_TITLE_MAX_LENGTH } from "@/modules/tasks/limits";
import {
  useCreateSubtask,
  useDeleteTask,
  useMoveSubtask,
  useSetSubtaskDone,
  useSubtasks,
  useUpdateTask,
} from "@/modules/tasks/queries";

type TaskSubtasksProps = {
  taskId: string;
};

export function TaskSubtasks({ taskId }: TaskSubtasksProps) {
  const { t } = useTranslation();
  const subtasksQuery = useSubtasks(taskId);
  const createSubtask = useCreateSubtask(taskId);
  const setDone = useSetSubtaskDone();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const moveSubtask = useMoveSubtask(taskId);

  const entries: CheckListEntry[] = (subtasksQuery.data ?? []).map((subtask) => ({
    id: subtask.id,
    text: subtask.title,
    isDone: subtask.completedAt !== null,
  }));

  if (!subtasksQuery.isSuccess) {
    return (
      <section aria-label={t("tasks.subtasks.title")} className="flex flex-col gap-2">
        <h3 className="font-display text-heading-3 font-semibold text-fg">
          {t("tasks.subtasks.title")}
        </h3>
        <QueryStatus
          isPending={subtasksQuery.isPending}
          isError={subtasksQuery.isError}
          errorTitle={t("tasks.subtasks.loadError")}
          onRetry={() => void subtasksQuery.refetch()}
        />
      </section>
    );
  }

  return (
    <CheckList
      kind="subtasks"
      entries={entries}
      maxLength={TASK_TITLE_MAX_LENGTH}
      isAdding={createSubtask.isPending}
      onAdd={(title) => createSubtask.mutate(title)}
      onToggle={(id, isDone) => setDone.mutate({ id, isDone })}
      onRename={(id, title) => updateTask.mutate({ id, input: { title } })}
      onDelete={(id) => deleteTask.mutate(id)}
      onMove={(reorder) => moveSubtask.mutate(reorder)}
    />
  );
}
