import type { State } from "./state";

export function removeTasks(state: State, ids: Set<string>): void {
  const doomed = new Set(ids);
  for (const task of state.tasks) {
    if (task.parentTaskId !== null && doomed.has(task.parentTaskId)) {
      doomed.add(task.id);
    }
  }
  state.tasks = state.tasks.filter((task) => !doomed.has(task.id));
  state.checklist = state.checklist.filter((item) => !doomed.has(item.taskId));
  state.comments = state.comments.filter((comment) => !doomed.has(comment.taskId));
  state.taskTags = state.taskTags.filter((link) => !doomed.has(link.taskId));
  state.attachments = state.attachments.filter((attachment) => !doomed.has(attachment.taskId));
  state.favorites = state.favorites.filter((favorite) => !doomed.has(favorite.entityId));
}

export function removeProjectContents(state: State, projectId: string): void {
  const boardIds = new Set(
    state.boards.filter((board) => board.projectId === projectId).map((board) => board.id),
  );
  const taskIds = new Set(
    state.tasks.filter((task) => task.projectId === projectId).map((task) => task.id),
  );
  removeTasks(state, taskIds);
  state.columns = state.columns.filter((column) => !boardIds.has(column.boardId));
  state.boards = state.boards.filter((board) => !boardIds.has(board.id));
}
