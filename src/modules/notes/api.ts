import {
  type CreateNoteInput,
  commands,
  type ListNotesInput,
  type NoteDetails,
  type NoteSummary,
  type RenameNoteResult,
  type SaveNoteInput,
  type SetupVaultInput,
  type VaultInfo,
  type VaultStatus,
} from "@/bindings";
import { unwrapResult } from "@/lib/unwrapResult";

export async function fetchVaultStatus(): Promise<VaultStatus> {
  return unwrapResult(await commands.getVaultStatus());
}

export async function setupVault(input: SetupVaultInput): Promise<VaultInfo> {
  return unwrapResult(await commands.setupVault(input));
}

export async function fetchNotes(input: ListNotesInput): Promise<NoteSummary[]> {
  return unwrapResult(await commands.listNotes(input));
}

export async function fetchNote(id: string): Promise<NoteDetails> {
  return unwrapResult(await commands.getNote(id));
}

export async function createNote(input: CreateNoteInput): Promise<NoteDetails> {
  return unwrapResult(await commands.createNote(input));
}

export async function saveNote(id: string, input: SaveNoteInput): Promise<NoteDetails> {
  return unwrapResult(await commands.saveNote(id, input));
}

export async function renameNote(id: string, newTitle: string): Promise<RenameNoteResult> {
  return unwrapResult(await commands.renameNote(id, newTitle));
}

export async function moveNote(id: string, newFolderPath: string | null): Promise<NoteSummary> {
  return unwrapResult(await commands.moveNote(id, newFolderPath));
}

export async function deleteNote(id: string): Promise<null> {
  return unwrapResult(await commands.deleteNote(id));
}
