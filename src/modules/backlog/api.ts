import { type BacklogGroup, type BacklogItem, commands, type ListBacklogInput } from "@/bindings";
import { unwrapResult } from "@/lib/unwrapResult";

export async function fetchBacklog(input: ListBacklogInput): Promise<BacklogItem[]> {
  return unwrapResult(await commands.listBacklog(input));
}

export async function fetchBacklogByProject(input: ListBacklogInput): Promise<BacklogGroup[]> {
  return unwrapResult(await commands.listBacklogByProject(input));
}
