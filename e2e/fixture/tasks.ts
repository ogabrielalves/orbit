import type {
  ActivityEntry,
  CreateSubtaskInput,
  CreateTaskInput,
  Task,
  UpdateTaskInput,
} from "@/bindings";
import { type Changes, type Recorder, track } from "./activity";
import { removeTasks } from "./cascade";
import { fail } from "./failure";
import { byPosition, placeAfter, previousSiblingId, rank, reposition } from "./ordering";
import type { Clock } from "./projects";
import type { State, StoredColumn } from "./state";
import { normalizeDate, requireText, textOrEmpty } from "./text";

const TITLE_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 20_000;
const MAX_SUBTASKS_PER_TASK = 100;
const PREVIEW_LENGTH = 120;
const COPY_SUFFIX = " (copy)";
const DEFAULT_HISTORY_LIMIT = 50;

function preview(text: string): string {
  const characters = [...text];
  return characters.length <= PREVIEW_LENGTH
    ? text
    : `${characters.slice(0, PREVIEW_LENGTH).join("")}…`;
}

function normalizeDescription(value: string | null | undefined): string {
  const text = textOrEmpty(value);
  if ([...text].length > DESCRIPTION_MAX_LENGTH) {
    fail("VALIDATION", `task description cannot exceed ${DESCRIPTION_MAX_LENGTH} characters`);
  }
  return text;
}

export function createTasks(state: State, clock: Clock, record: Recorder) {
  function find(id: string): Task {
    const task = state.tasks.find((candidate) => candidate.id === id);
    if (task === undefined) {
      fail("NOT_FOUND", "task not found");
    }
    return task;
  }

  function findColumn(id: string): StoredColumn {
    const column = state.columns.find((candidate) => candidate.id === id);
    if (column === undefined) {
      fail("NOT_FOUND", "column not found");
    }
    return column;
  }

  function boardName(boardId: string | null): string | null {
    return state.boards.find((board) => board.id === boardId)?.name ?? null;
  }

  function columnPlacement(columnId: string | null) {
    const column = state.columns.find((candidate) => candidate.id === columnId);
    return {
      board: column === undefined ? null : boardName(column.boardId),
      column: column?.name ?? null,
    };
  }

  function visibleGroup(task: Pick<Task, "columnId" | "projectId">): Task[] {
    return state.tasks
      .filter(
        (candidate) =>
          candidate.parentTaskId === null &&
          candidate.archivedAt === null &&
          candidate.columnId === task.columnId &&
          (task.columnId !== null || candidate.projectId === task.projectId),
      )
      .sort(byPosition);
  }

  function subtasksOf(parentId: string): Task[] {
    return state.tasks.filter((task) => task.parentTaskId === parentId).sort(byPosition);
  }

  function endPosition(group: Task[]): string {
    return rank(group.length);
  }

  function create(input: CreateTaskInput): Task {
    const title = requireText("task title", input.title, TITLE_MAX_LENGTH);
    const description = normalizeDescription(input.description);
    const dueDate = normalizeDate(input.dueDate);
    if (!state.projects.some((project) => project.id === input.projectId)) {
      fail("NOT_FOUND", "project not found");
    }
    let boardId: string | null = null;
    let columnId: string | null = null;
    let landsInDone = false;
    if (input.columnId !== undefined && input.columnId !== null) {
      const column = findColumn(input.columnId);
      const board = state.boards.find((candidate) => candidate.id === column.boardId);
      if (board?.projectId !== input.projectId) {
        fail("VALIDATION", "column belongs to a different project");
      }
      boardId = column.boardId;
      columnId = column.id;
      landsInDone = column.kind === "done";
    }
    const now = clock.now();
    const task: Task = {
      id: clock.nextId("t"),
      projectId: input.projectId,
      boardId,
      columnId,
      parentTaskId: null,
      title,
      description,
      priority: input.priority ?? "medium",
      dueDate,
      position: endPosition(visibleGroup({ columnId, projectId: input.projectId })),
      createdAt: now,
      updatedAt: now,
      completedAt: landsInDone ? now : null,
      archivedAt: null,
    };
    state.tasks.push(task);
    record("task", task.id, "created", { title: { from: null, to: task.title } });
    return task;
  }

  function listByBoard(boardId: string): Task[] {
    if (!state.boards.some((board) => board.id === boardId)) {
      fail("NOT_FOUND", "board not found");
    }
    return state.tasks
      .filter(
        (task) =>
          task.boardId === boardId && task.archivedAt === null && task.parentTaskId === null,
      )
      .sort((a, b) => {
        const left = a.columnId ?? "";
        const right = b.columnId ?? "";
        return left === right ? byPosition(a, b) : left < right ? -1 : 1;
      });
  }

  function update(id: string, input: UpdateTaskInput): Task {
    const task = find(id);
    const before = { ...task };
    if (input.title !== undefined && input.title !== null) {
      task.title = requireText("task title", input.title, TITLE_MAX_LENGTH);
    }
    if (input.description !== undefined && input.description !== null) {
      task.description = normalizeDescription(input.description);
    }
    if (input.priority !== undefined && input.priority !== null) {
      task.priority = input.priority;
    }
    if (input.dueDate !== undefined) {
      task.dueDate = normalizeDate(input.dueDate);
    }
    const changes: Changes = {};
    track(changes, "title", before.title, task.title);
    if (before.description !== task.description) {
      track(changes, "description", preview(before.description), preview(task.description));
    }
    track(changes, "priority", before.priority, task.priority);
    track(changes, "dueDate", before.dueDate, task.dueDate);
    if (Object.keys(changes).length === 0) {
      return task;
    }
    task.updatedAt = clock.now();
    record("task", id, "updated", changes);
    return task;
  }

  function rejectSubtask(task: Task, verb: string) {
    if (task.parentTaskId !== null) {
      fail("VALIDATION", `subtasks cannot be ${verb}`);
    }
  }

  function archive(id: string): Task {
    const task = find(id);
    rejectSubtask(task, "archived");
    if (task.archivedAt !== null) {
      return task;
    }
    const now = clock.now();
    task.archivedAt = now;
    task.updatedAt = now;
    record("task", id, "archived");
    return task;
  }

  function restore(id: string): Task {
    const task = find(id);
    rejectSubtask(task, "restored");
    if (task.archivedAt === null) {
      return task;
    }
    task.archivedAt = null;
    task.position = endPosition(visibleGroup(task));
    task.updatedAt = clock.now();
    record("task", id, "restored");
    return task;
  }

  function remove(id: string): null {
    const task = find(id);
    record("task", id, "deleted", { title: { from: task.title, to: null } });
    removeTasks(state, new Set([id]));
    return null;
  }

  function findMovable(id: string): Task {
    const task = find(id);
    if (task.archivedAt !== null) {
      fail("CONFLICT", "archived tasks cannot be moved; restore the task first");
    }
    if (task.parentTaskId !== null) {
      fail("VALIDATION", "subtasks cannot be placed on a board or in the backlog");
    }
    return task;
  }

  function move(id: string, columnId: string, afterTaskId: string | null): Task {
    const task = findMovable(id);
    const target = findColumn(columnId);
    const targetBoard = state.boards.find((board) => board.id === target.boardId);
    if (targetBoard?.projectId !== task.projectId) {
      fail("INVALID_MOVE", "the column belongs to another project");
    }
    const ordered = visibleGroup({ columnId: target.id, projectId: task.projectId });
    const isSameColumn = task.columnId === target.id;
    if (isSameColumn && previousSiblingId(ordered, id) === afterTaskId) {
      return task;
    }
    const origin = state.columns.find((column) => column.id === task.columnId);
    const reordered = placeAfter(ordered, task, afterTaskId);
    const placement = columnPlacement(task.columnId);
    const now = clock.now();
    if (!isSameColumn) {
      const wasDone = origin?.kind === "done";
      const entersDone = target.kind === "done";
      task.completedAt = entersDone ? (wasDone ? task.completedAt : now) : null;
      task.boardId = target.boardId;
      task.columnId = target.id;
    }
    reposition(reordered);
    task.updatedAt = now;
    if (!isSameColumn) {
      const destination = columnPlacement(target.id);
      const changes: Changes = {};
      track(changes, "board", placement.board, destination.board);
      track(changes, "column", placement.column, destination.column);
      record("task", id, "moved", changes);
    }
    return task;
  }

  function duplicate(id: string, title: string | null): Task {
    const source = find(id);
    if (source.parentTaskId !== null) {
      fail("VALIDATION", "subtasks cannot be duplicated on their own; duplicate the parent task");
    }
    if (source.archivedAt !== null) {
      fail("CONFLICT", "archived tasks cannot be duplicated; restore the task first");
    }
    const newTitle =
      title === null
        ? `${[...source.title]
            .slice(0, TITLE_MAX_LENGTH - COPY_SUFFIX.length)
            .join("")
            .trimEnd()}${COPY_SUFFIX}`
        : requireText("task title", title, TITLE_MAX_LENGTH);
    const now = clock.now();
    const copy: Task = {
      ...source,
      id: clock.nextId("t"),
      title: newTitle,
      createdAt: now,
      updatedAt: now,
      completedAt: source.completedAt === null ? null : now,
    };
    const ordered = visibleGroup(source);
    state.tasks.push(copy);
    reposition(placeAfter([...ordered, copy], copy, source.id));
    copyDetails(source.id, copy.id, now);
    for (const original of subtasksOf(source.id)) {
      const subtask: Task = {
        ...original,
        id: clock.nextId("t"),
        parentTaskId: copy.id,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      };
      state.tasks.push(subtask);
      copyDetails(original.id, subtask.id, now);
    }
    record("task", copy.id, "duplicated", { source: { from: null, to: source.title } });
    return copy;
  }

  function copyDetails(fromTaskId: string, toTaskId: string, now: string) {
    for (const item of state.checklist.filter((entry) => entry.taskId === fromTaskId)) {
      state.checklist.push({
        ...item,
        id: clock.nextId("k"),
        taskId: toTaskId,
        isDone: false,
        createdAt: now,
        updatedAt: now,
      });
    }
    for (const link of state.taskTags.filter((entry) => entry.taskId === fromTaskId)) {
      state.taskTags.push({ taskId: toTaskId, tagId: link.tagId });
    }
  }

  function history(taskId: string, limit: number | null): ActivityEntry[] {
    find(taskId);
    return state.activity
      .filter((entry) => entry.entityType === "task" && entry.entityId === taskId)
      .slice(0, limit ?? DEFAULT_HISTORY_LIMIT);
  }

  function createSubtask(input: CreateSubtaskInput): Task {
    const title = requireText("subtask title", input.title, TITLE_MAX_LENGTH);
    const parent = find(input.parentTaskId);
    if (parent.parentTaskId !== null) {
      fail("VALIDATION", "a subtask cannot have subtasks of its own");
    }
    if (parent.archivedAt !== null) {
      fail("CONFLICT", "archived tasks cannot receive subtasks; restore the task first");
    }
    const siblings = subtasksOf(parent.id);
    if (siblings.length >= MAX_SUBTASKS_PER_TASK) {
      fail("VALIDATION", `a task cannot have more than ${MAX_SUBTASKS_PER_TASK} subtasks`);
    }
    const now = clock.now();
    const subtask: Task = {
      id: clock.nextId("t"),
      projectId: parent.projectId,
      boardId: null,
      columnId: null,
      parentTaskId: parent.id,
      title,
      description: "",
      priority: "medium",
      dueDate: null,
      position: rank(siblings.length),
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      archivedAt: null,
    };
    state.tasks.push(subtask);
    record("task", subtask.id, "created", { title: { from: null, to: title } });
    return subtask;
  }

  function findSubtask(id: string): Task {
    const task = find(id);
    if (task.parentTaskId === null) {
      fail("VALIDATION", "task is not a subtask");
    }
    return task;
  }

  function listSubtasks(parentTaskId: string): Task[] {
    find(parentTaskId);
    return subtasksOf(parentTaskId);
  }

  function setSubtaskDone(id: string, isDone: boolean): Task {
    const subtask = findSubtask(id);
    if ((subtask.completedAt !== null) === isDone) {
      return subtask;
    }
    const now = clock.now();
    subtask.completedAt = isDone ? now : null;
    subtask.updatedAt = now;
    record("task", id, isDone ? "completed" : "reopened");
    return subtask;
  }

  function moveSubtask(id: string, afterSubtaskId: string | null): Task {
    const subtask = findSubtask(id);
    const ordered = subtasksOf(subtask.parentTaskId ?? "");
    if (previousSiblingId(ordered, id) === afterSubtaskId) {
      return subtask;
    }
    reposition(placeAfter(ordered, subtask, afterSubtaskId));
    subtask.updatedAt = clock.now();
    return subtask;
  }

  return {
    create,
    find,
    listByBoard,
    update,
    archive,
    restore,
    remove,
    move,
    duplicate,
    history,
    createSubtask,
    listSubtasks,
    setSubtaskDone,
    moveSubtask,
  };
}
