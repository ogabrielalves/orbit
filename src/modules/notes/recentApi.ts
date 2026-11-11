import { commands, type RecentNote } from "@/bindings";
import { unwrapResult } from "@/lib/unwrapResult";

export async function fetchRecentNotes(limit: number | null): Promise<RecentNote[]> {
  return unwrapResult(await commands.listRecentNotes({ limit }));
}
