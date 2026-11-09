import { type FormEvent, type KeyboardEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Task, TaskPriority } from "@/bindings";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { Select } from "@/components/atoms/Select";
import { Textarea } from "@/components/atoms/Textarea";
import { FormField } from "@/components/molecules/FormField";
import { matchesHotkey } from "@/lib/hotkey";
import {
  buildTaskUpdate,
  hasTaskChanges,
  type TaskFormValues,
  taskPriorities,
  toTaskFormValues,
} from "@/modules/tasks/form";
import { TASK_DESCRIPTION_MAX_LENGTH, TASK_TITLE_MAX_LENGTH } from "@/modules/tasks/limits";
import { useUpdateTask } from "@/modules/tasks/queries";

type TaskDetailsFormProps = {
  task: Task;
};

export function TaskDetailsForm({ task }: TaskDetailsFormProps) {
  const { t } = useTranslation();
  const updateTask = useUpdateTask();
  const [values, setValues] = useState<TaskFormValues>(toTaskFormValues(task));

  const isTitleBlank = values.title.trim() === "";
  const hasChanges = hasTaskChanges(task, values);
  const hasDueDate = values.dueDate !== "";
  const canSave = hasChanges && !isTitleBlank;

  function setValue<TKey extends keyof TaskFormValues>(key: TKey, value: TaskFormValues[TKey]) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave) {
      return;
    }

    updateTask.mutate(
      { id: task.id, input: buildTaskUpdate(task, values) },
      { onSuccess: () => toast.success(t("tasks.detail.toast.updated")) },
    );
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    const isSubmitShortcut = matchesHotkey("mod+enter", event);
    if (isSubmitShortcut) {
      event.preventDefault();
      event.currentTarget.requestSubmit();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      onKeyDown={handleKeyDown}
      aria-label={t("tasks.detail.formLabel")}
      className="flex flex-col gap-4.5 p-6"
    >
      <FormField label={t("tasks.detail.titleLabel")}>
        {({ id, "aria-describedby": describedBy }) => (
          <Input
            id={id}
            aria-describedby={describedBy}
            value={values.title}
            maxLength={TASK_TITLE_MAX_LENGTH}
            onChange={(event) => setValue("title", event.target.value)}
          />
        )}
      </FormField>
      <FormField label={t("tasks.detail.descriptionLabel")}>
        {({ id, "aria-describedby": describedBy }) => (
          <Textarea
            id={id}
            aria-describedby={describedBy}
            rows={6}
            value={values.description}
            maxLength={TASK_DESCRIPTION_MAX_LENGTH}
            placeholder={t("tasks.detail.descriptionPlaceholder")}
            onChange={(event) => setValue("description", event.target.value)}
          />
        )}
      </FormField>
      <div className="grid grid-cols-1 gap-4.5 sm:grid-cols-2">
        <FormField label={t("tasks.detail.priorityLabel")}>
          {({ id, "aria-describedby": describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={values.priority}
              onChange={(event) => setValue("priority", event.target.value as TaskPriority)}
            >
              {taskPriorities.map((priority) => (
                <option key={priority} value={priority}>
                  {t(`tasks.priority.${priority}`)}
                </option>
              ))}
            </Select>
          )}
        </FormField>
        <FormField label={t("tasks.detail.dueDateLabel")}>
          {({ id, "aria-describedby": describedBy }) => (
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  id={id}
                  aria-describedby={describedBy}
                  type="date"
                  value={values.dueDate}
                  onChange={(event) => setValue("dueDate", event.target.value)}
                />
              </div>
              {hasDueDate && (
                <Button variant="ghost" size="sm" onClick={() => setValue("dueDate", "")}>
                  {t("tasks.detail.clearDate")}
                </Button>
              )}
            </div>
          )}
        </FormField>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          disabled={!hasChanges}
          onClick={() => setValues(toTaskFormValues(task))}
        >
          {t("tasks.detail.discard")}
        </Button>
        <Button type="submit" disabled={!canSave} isLoading={updateTask.isPending}>
          {t("tasks.detail.save")}
        </Button>
      </div>
    </form>
  );
}
