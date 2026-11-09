import type { CSSProperties, HTMLAttributes, Ref } from "react";
import { useTranslation } from "react-i18next";
import type { Task } from "@/bindings";
import { Badge } from "@/components/atoms/Badge";
import { formatDueDate, toLocalIsoDate } from "@/lib/dates";
import { priorityTones } from "@/modules/tasks/priority";

type TaskCardProps = {
  task: Task;
  isDragging?: boolean;
  innerRef?: Ref<HTMLLIElement>;
  style?: CSSProperties;
  dragProps?: HTMLAttributes<HTMLLIElement>;
};

export function TaskCard({ task, isDragging = false, innerRef, style, dragProps }: TaskCardProps) {
  const { t, i18n } = useTranslation();
  const now = new Date();

  const dueDate = task.dueDate;
  const hasDueDate = dueDate !== null;
  const isCompleted = task.completedAt !== null;
  const isOverdue = hasDueDate && !isCompleted && dueDate < toLocalIsoDate(now);
  const dueClass = isOverdue ? "font-medium text-danger-fg" : "text-fg-muted";
  const isDraggable = dragProps !== undefined;
  const dragClass = isDraggable
    ? "cursor-grab touch-manipulation active:cursor-grabbing focus-visible:shadow-focus"
    : "";
  const draggingClass = isDragging ? "opacity-40" : "";

  return (
    <li
      ref={innerRef}
      style={style}
      {...dragProps}
      className={`flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 shadow-xs ${dragClass} ${draggingClass}`}
    >
      <span className="text-small font-medium break-words text-fg">{task.title}</span>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge tone={priorityTones[task.priority]}>{t(`tasks.priority.${task.priority}`)}</Badge>
        {hasDueDate && (
          <span className={`text-caption ${dueClass}`}>
            <span className="sr-only">{t("tasks.dueLabel")}: </span>
            {formatDueDate(dueDate, now, i18n.language)}
            {isOverdue && <span className="sr-only"> ({t("tasks.overdue")})</span>}
          </span>
        )}
      </div>
    </li>
  );
}
