import { type CreateTagInput, commands, type Tag } from "@/bindings";
import { unwrapResult } from "@/lib/unwrapResult";

export async function fetchTags(): Promise<Tag[]> {
  return unwrapResult(await commands.listTags());
}

export async function fetchTaskTags(taskId: string): Promise<Tag[]> {
  return unwrapResult(await commands.listTaskTags(taskId));
}

export async function createTag(input: CreateTagInput): Promise<Tag> {
  return unwrapResult(await commands.createTag(input));
}

export async function assignTag(taskId: string, tagId: string): Promise<null> {
  return unwrapResult(await commands.assignTag(taskId, tagId));
}

export async function unassignTag(taskId: string, tagId: string): Promise<null> {
  return unwrapResult(await commands.unassignTag(taskId, tagId));
}
