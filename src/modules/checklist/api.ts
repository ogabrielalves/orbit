import {
  type ChecklistItem,
  type CreateChecklistItemInput,
  commands,
  type UpdateChecklistItemInput,
} from "@/bindings";
import { unwrapResult } from "@/lib/unwrapResult";

export async function fetchChecklist(taskId: string): Promise<ChecklistItem[]> {
  return unwrapResult(await commands.listChecklistItems(taskId));
}

export async function createChecklistItem(input: CreateChecklistItemInput): Promise<ChecklistItem> {
  return unwrapResult(await commands.createChecklistItem(input));
}

export async function updateChecklistItem(
  id: string,
  input: UpdateChecklistItemInput,
): Promise<ChecklistItem> {
  return unwrapResult(await commands.updateChecklistItem(id, input));
}

export async function moveChecklistItem(
  id: string,
  afterItemId: string | null,
): Promise<ChecklistItem> {
  return unwrapResult(await commands.moveChecklistItem(id, afterItemId));
}

export async function deleteChecklistItem(id: string): Promise<null> {
  return unwrapResult(await commands.deleteChecklistItem(id));
}
