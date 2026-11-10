import { type CreateFolderInput, commands, type FolderEntry } from "@/bindings";
import { unwrapResult } from "@/lib/unwrapResult";

export async function fetchFolders(): Promise<FolderEntry[]> {
  return unwrapResult(await commands.listFolders());
}

export async function createFolder(input: CreateFolderInput): Promise<FolderEntry> {
  return unwrapResult(await commands.createFolder(input));
}

export async function renameFolder(path: string, newName: string): Promise<FolderEntry> {
  return unwrapResult(await commands.renameFolder(path, newName));
}

export async function moveFolder(path: string, newParentPath: string | null): Promise<FolderEntry> {
  return unwrapResult(await commands.moveFolder(path, newParentPath));
}

export async function deleteFolder(path: string, recursive: boolean): Promise<null> {
  return unwrapResult(await commands.deleteFolder(path, recursive));
}
