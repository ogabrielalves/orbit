import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "react-i18next";
import MoreIcon from "@/assets/icons/linha/mais-opcoes.svg?react";
import type { BoardColumn as BoardColumnData, Task } from "@/bindings";
import { IconButton } from "@/components/atoms/IconButton";
import { Skeleton } from "@/components/atoms/Skeleton";
import { DropdownMenu } from "@/components/molecules/DropdownMenu";
import { resolveProjectColor } from "@/modules/projects/colors";
import { TaskCard } from "@/pages/board/TaskCard";

type BoardColumnProps = {
  column: BoardColumnData;
  tasks: Task[] | undefined;
  index: number;
  total: number;
  onEdit: (column: BoardColumnData) => void;
  onMoveLeft: (column: BoardColumnData) => void;
  onMoveRight: (column: BoardColumnData) => void;
  onDelete: (column: BoardColumnData) => void;
};

export function BoardColumn({
  column,
  tasks,
  index,
  total,
  onEdit,
  onMoveLeft,
  onMoveRight,
  onDelete,
}: BoardColumnProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column.id,
  });

  const isFirst = index === 0;
  const isLast = index === total - 1;
  const hasColor = column.color !== null;
  const dotColor = hasColor ? resolveProjectColor(column.color) : "var(--color-fg-subtle)";
  const draggingClass = isDragging ? "opacity-60" : "";
  const isLoadingTasks = tasks === undefined;
  const hasTasks = tasks !== undefined && tasks.length > 0;
  const hasNoTasks = tasks !== undefined && tasks.length === 0;

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex w-75 shrink-0 flex-col gap-2.5 rounded-xl bg-surface-column p-2.5 ${draggingClass}`}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={t("boards.column.reorder", { name: column.name })}
          className="flex min-w-0 flex-1 cursor-grab items-center gap-2 rounded-sm px-1 py-1 text-left active:cursor-grabbing"
        >
          <span
            aria-hidden="true"
            style={{ backgroundColor: dotColor }}
            className="size-2 shrink-0 rounded-full"
          />
          <span className="truncate text-caption font-bold tracking-wider text-fg uppercase">
            {column.name}
          </span>
          <span className="text-caption text-fg-muted">{column.taskCount}</span>
        </button>
        <DropdownMenu
          trigger={
            <IconButton
              icon={MoreIcon}
              size="sm"
              label={t("boards.column.actions", { name: column.name })}
            />
          }
          sections={[
            [
              { id: "edit", label: t("boards.column.edit"), onSelect: () => onEdit(column) },
              {
                id: "left",
                label: t("boards.column.moveLeft"),
                isDisabled: isFirst,
                onSelect: () => onMoveLeft(column),
              },
              {
                id: "right",
                label: t("boards.column.moveRight"),
                isDisabled: isLast,
                onSelect: () => onMoveRight(column),
              },
            ],
            [
              {
                id: "delete",
                label: t("boards.column.delete"),
                isDanger: true,
                onSelect: () => onDelete(column),
              },
            ],
          ]}
        />
      </div>
      {isLoadingTasks && <Skeleton className="h-16 rounded-lg" />}
      {hasNoTasks && (
        <p className="rounded-lg border border-dashed border-border-strong px-3 py-6 text-center text-small text-fg-muted">
          {t("boards.column.emptyTasks")}
        </p>
      )}
      {hasTasks && (
        <ul
          aria-label={t("boards.column.tasksLabel", { name: column.name })}
          className="flex flex-col gap-2"
        >
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </ul>
      )}
    </li>
  );
}
