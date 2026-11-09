import type { Task, TaskPriority, UpdateTaskInput } from "@/bindings";
import { TASK_TITLE_MAX_LENGTH } from "@/modules/tasks/limits";

export type TaskFormValues = {
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: string;
};

export const taskPriorities: TaskPriority[] = ["low", "medium", "high", "urgent"];

export function toTaskFormValues(task: Task): TaskFormValues {
  return {
    title: task.title,
    description: task.description,
    priority: task.priority,
    dueDate: task.dueDate ?? "",
  };
}

export function buildTaskUpdate(task: Task, values: TaskFormValues): UpdateTaskInput {
  const title = values.title.trim();
  const description = values.description.trim();
  const dueDate = values.dueDate === "" ? null : values.dueDate;
  const update: UpdateTaskInput = {};

  const hasNewTitle = title !== task.title;
  if (hasNewTitle) {
    update.title = title;
  }
  const hasNewDescription = description !== task.description;
  if (hasNewDescription) {
    update.description = description;
  }
  const hasNewPriority = values.priority !== task.priority;
  if (hasNewPriority) {
    update.priority = values.priority;
  }
  const hasNewDueDate = dueDate !== task.dueDate;
  if (hasNewDueDate) {
    update.dueDate = dueDate;
  }

  return update;
}

export function hasTaskChanges(task: Task, values: TaskFormValues): boolean {
  return Object.keys(buildTaskUpdate(task, values)).length > 0;
}

export function buildCopyTitle(title: string, translate: (title: string) => string): string {
  const copy = translate(title);
  const fits = copy.length <= TASK_TITLE_MAX_LENGTH;
  if (fits) {
    return copy;
  }

  const overhead = copy.length - title.length;
  return translate(title.slice(0, TASK_TITLE_MAX_LENGTH - overhead));
}
