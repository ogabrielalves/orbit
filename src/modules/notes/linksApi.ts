import { commands, type NoteLinks, type NoteSummary } from "@/bindings";
import { unwrapResult } from "@/lib/unwrapResult";

export async function resolveNoteLink(target: string): Promise<NoteSummary | null> {
  return unwrapResult(await commands.resolveNoteLink(target));
}

export async function fetchNoteLinks(id: string): Promise<NoteLinks> {
  return unwrapResult(await commands.getNoteLinks(id));
}
