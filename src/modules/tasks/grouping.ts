import type { Task } from "@/bindings";

function comparePosition(a: Task, b: Task): number {
  if (a.position !== b.position) {
    return a.position < b.position ? -1 : 1;
  }
  if (a.id !== b.id) {
    return a.id < b.id ? -1 : 1;
  }
  return 0;
}

export function groupTasksByColumn(tasks: Task[]): Map<string, Task[]> {
  const groups = new Map<string, Task[]>();

  for (const task of [...tasks].sort(comparePosition)) {
    const columnId = task.columnId;
    const hasColumn = columnId !== null;
    if (hasColumn) {
      groups.set(columnId, [...(groups.get(columnId) ?? []), task]);
    }
  }

  return groups;
}
