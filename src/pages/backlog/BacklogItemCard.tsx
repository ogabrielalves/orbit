import { useTranslation } from "react-i18next";
import type { BacklogItem } from "@/bindings";
import { Badge } from "@/components/atoms/Badge";
import { TagChip } from "@/components/molecules/TagChip";
import { formatDueDate, toLocalIsoDate } from "@/lib/dates";
import { priorityTones } from "@/modules/tasks/priority";

type BacklogItemCardProps = {
  item: BacklogItem;
  showProject: boolean;
  onOpen: () => void;
};

export function BacklogItemCard({ item, showProject, onOpen }: BacklogItemCardProps) {
  const { t, i18n } = useTranslation();
  const { task } = item;
  const now = new Date();

  const dueDate = task.dueDate;
  const hasDueDate = dueDate !== null;
  const isOverdue = hasDueDate && dueDate < toLocalIsoDate(now);
  const dueClass = isOverdue ? "font-medium text-danger-fg" : "text-fg-muted";
  const hasSubtasks = item.subtaskCount > 0;
  const hasChecklist = item.checklistCount > 0;
  const hasTags = item.tags.length > 0;

  return (
    <li className="relative flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 shadow-xs has-focus-visible:shadow-focus">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="min-w-0 cursor-pointer text-left text-small font-medium break-words text-fg after:absolute after:inset-0 after:content-[''] focus-visible:shadow-none"
        >
          {task.title}
        </button>
        {showProject && <span className="text-caption text-fg-muted">{item.projectName}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={priorityTones[task.priority]}>{t(`tasks.priority.${task.priority}`)}</Badge>
        {hasDueDate && (
          <span className={`text-caption ${dueClass}`}>
            <span className="sr-only">{t("tasks.dueLabel")}: </span>
            {formatDueDate(dueDate, now, i18n.language)}
            {isOverdue && <span className="sr-only"> ({t("tasks.overdue")})</span>}
          </span>
        )}
        {hasSubtasks && (
          <span className="text-caption text-fg-muted">
            {t("backlog.subtasksProgress", { done: item.subtasksDone, total: item.subtaskCount })}
          </span>
        )}
        {hasChecklist && (
          <span className="text-caption text-fg-muted">
            {t("backlog.checklistProgress", {
              done: item.checklistDone,
              total: item.checklistCount,
            })}
          </span>
        )}
      </div>
      {hasTags && (
        <ul aria-label={t("backlog.tagsLabel")} className="flex flex-wrap gap-1.5">
          {item.tags.map((tag) => (
            <li key={tag.id} className="max-w-full">
              <TagChip name={tag.name} color={tag.color} />
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
