import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties, HTMLAttributes, Ref } from "react";
import { useTranslation } from "react-i18next";
import type { BacklogItem } from "@/bindings";
import { Badge } from "@/components/atoms/Badge";
import { Button } from "@/components/atoms/Button";
import { TagChip } from "@/components/molecules/TagChip";
import { formatDueDate, toLocalIsoDate } from "@/lib/dates";
import { priorityTones } from "@/modules/tasks/priority";

type BacklogItemCardProps = {
  item: BacklogItem;
  showProject: boolean;
  onOpen: () => void;
  onSend: () => void;
  isDragging?: boolean;
  innerRef?: Ref<HTMLLIElement>;
  style?: CSSProperties;
  dragProps?: HTMLAttributes<HTMLLIElement>;
};

export function BacklogItemCard({
  item,
  showProject,
  onOpen,
  onSend,
  isDragging = false,
  innerRef,
  style,
  dragProps,
}: BacklogItemCardProps) {
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
  const isDraggable = dragProps !== undefined;
  const dragClass = isDraggable ? "cursor-grab touch-manipulation active:cursor-grabbing" : "";
  const draggingClass = isDragging ? "opacity-40" : "";

  return (
    <li
      ref={innerRef}
      style={style}
      {...dragProps}
      className={`relative flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 shadow-xs has-focus-visible:shadow-focus ${dragClass} ${draggingClass}`}
    >
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
        <span className="relative z-10 ml-auto">
          <Button
            variant="secondary"
            size="sm"
            aria-label={t("backlog.send.open", { title: task.title })}
            onClick={onSend}
          >
            {t("backlog.send.openShort")}
          </Button>
        </span>
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

export function SortableBacklogItemCard(props: Omit<BacklogItemCardProps, "dragProps">) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.item.task.id,
  });

  // Keep the list item semantics: only the focus and the sortable description are needed.
  const { role: _role, ...sortableAttributes } = attributes;

  return (
    <BacklogItemCard
      {...props}
      isDragging={isDragging}
      innerRef={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      dragProps={{ ...sortableAttributes, ...listeners } as HTMLAttributes<HTMLLIElement>}
    />
  );
}
