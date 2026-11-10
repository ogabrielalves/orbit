import { isPathInside } from "@/pages/notes/folderModel";

export const FOLDER_DROP_PREFIX = "folder-drop:";
export const NOTE_DRAG_PREFIX = "note-drag:";
export const FOLDER_DRAG_PREFIX = "folder-drag:";

export type NoteDragSource = { kind: "note"; id: string; name: string; folderPath: string };
export type FolderDragSource = { kind: "folder"; path: string; name: string };
export type DragSource = NoteDragSource | FolderDragSource;

export type MoveAction =
  | { kind: "note"; id: string; name: string; newFolderPath: string | null }
  | { kind: "folder"; path: string; name: string; newParentPath: string | null };

export function parentFolderOf(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  const isRootLevel = lastSlash === -1;
  return isRootLevel ? "" : path.slice(0, lastSlash);
}

export function resolveMove(source: DragSource, targetPath: string): MoveAction | null {
  const newPath = targetPath === "" ? null : targetPath;

  if (source.kind === "note") {
    const isSameFolder = source.folderPath === targetPath;
    if (isSameFolder) {
      return null;
    }
    return { kind: "note", id: source.id, name: source.name, newFolderPath: newPath };
  }

  const isIntoItself = isPathInside(targetPath, source.path);
  const isSameParent = parentFolderOf(source.path) === targetPath;
  if (isIntoItself || isSameParent) {
    return null;
  }
  return { kind: "folder", path: source.path, name: source.name, newParentPath: newPath };
}

export function remapPathAfterMove(
  selectedPath: string,
  previousPath: string,
  movedPath: string,
): string | null {
  const isInside = isPathInside(selectedPath, previousPath);
  if (!isInside) {
    return null;
  }
  return movedPath + selectedPath.slice(previousPath.length);
}
