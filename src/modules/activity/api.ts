import { type ActivityEntry, commands } from "@/bindings";
import { unwrapResult } from "@/lib/unwrapResult";

export async function fetchRecentActivity(limit: number | null): Promise<ActivityEntry[]> {
  return unwrapResult(await commands.listRecentActivity(limit));
}

export async function fetchTaskHistory(
  taskId: string,
  limit: number | null,
): Promise<ActivityEntry[]> {
  return unwrapResult(await commands.getTaskHistory(taskId, limit));
}
