import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { HTMLAttributes } from "react";
import type { Task } from "@/bindings";
import { TaskCard } from "@/pages/board/TaskCard";

type SortableTaskCardProps = {
  task: Task;
  onOpen: (taskId: string) => void;
};

export function SortableTaskCard({ task, onOpen }: SortableTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: "task", columnId: task.columnId },
  });

  // Keep the list item semantics: only the focus and the sortable description are needed.
  const { role: _role, ...sortableAttributes } = attributes;

  return (
    <TaskCard
      task={task}
      isDragging={isDragging}
      onOpen={() => onOpen(task.id)}
      innerRef={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      dragProps={{ ...sortableAttributes, ...listeners } as HTMLAttributes<HTMLLIElement>}
    />
  );
}
