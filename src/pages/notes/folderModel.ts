import type { FolderEntry } from "@/bindings";

export type FolderNode = {
  entry: FolderEntry;
  children: FolderNode[];
};

function parentPathOf(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  const isRootLevel = lastSlash === -1;
  return isRootLevel ? "" : path.slice(0, lastSlash);
}

export function buildFolderTree(entries: FolderEntry[], locale: string): FolderNode[] {
  const nodes = new Map<string, FolderNode>();
  for (const entry of entries) {
    nodes.set(entry.path, { entry, children: [] });
  }

  const roots: FolderNode[] = [];
  for (const node of nodes.values()) {
    const parent = nodes.get(parentPathOf(node.entry.path));
    const hasParent = parent !== undefined;
    if (hasParent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const byName = (a: FolderNode, b: FolderNode) => a.entry.name.localeCompare(b.entry.name, locale);
  for (const node of nodes.values()) {
    node.children.sort(byName);
  }
  return roots.sort(byName);
}

export function findFolderNode(roots: FolderNode[], path: string): FolderNode | undefined {
  for (const node of roots) {
    if (node.entry.path === path) {
      return node;
    }
    const found = findFolderNode(node.children, path);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

export function countNotesDeep(node: FolderNode): number {
  return node.children.reduce(
    (total, child) => total + countNotesDeep(child),
    node.entry.noteCount,
  );
}

export function countFoldersDeep(node: FolderNode): number {
  return node.children.reduce((total, child) => total + 1 + countFoldersDeep(child), 0);
}

export function isFolderEmpty(node: FolderNode): boolean {
  return node.entry.noteCount === 0 && node.children.length === 0;
}

export function isPathInside(path: string, folderPath: string): boolean {
  return path === folderPath || path.startsWith(`${folderPath}/`);
}

export function getAncestorPaths(path: string): string[] {
  const parts = path.split("/").filter((part) => part !== "");
  return parts.slice(0, -1).map((_part, index) => parts.slice(0, index + 1).join("/"));
}
