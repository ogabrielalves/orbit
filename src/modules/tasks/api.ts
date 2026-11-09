import { type CreateTaskInput, commands, type Task, type UpdateTaskInput } from "@/bindings";
import { unwrapResult } from "@/lib/unwrapResult";

export async function fetchBoardTasks(boardId: string): Promise<Task[]> {
  return unwrapResult(await commands.listBoardTasks(boardId));
}

export async function fetchTask(id: string): Promise<Task> {
  return unwrapResult(await commands.getTask(id));
}

export async function createTask(input: CreateTaskInput): Promise<Task> {
  return unwrapResult(await commands.createTask(input));
}

export async function updateTask(id: string, input: UpdateTaskInput): Promise<Task> {
  return unwrapResult(await commands.updateTask(id, input));
}

export async function archiveTask(id: string): Promise<Task> {
  return unwrapResult(await commands.archiveTask(id));
}

export async function restoreTask(id: string): Promise<Task> {
  return unwrapResult(await commands.restoreTask(id));
}

export async function deleteTask(id: string): Promise<null> {
  return unwrapResult(await commands.deleteTask(id));
}

export async function moveTask(
  id: string,
  columnId: string,
  afterTaskId: string | null,
): Promise<Task> {
  return unwrapResult(await commands.moveTask(id, columnId, afterTaskId));
}

export async function sendTaskToBoard(
  id: string,
  boardId: string,
  columnId: string | null,
): Promise<Task> {
  return unwrapResult(await commands.sendTaskToBoard(id, boardId, columnId));
}

export async function sendTaskToBacklog(id: string): Promise<Task> {
  return unwrapResult(await commands.sendTaskToBacklog(id));
}
