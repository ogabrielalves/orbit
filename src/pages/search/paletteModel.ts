import type { ReactNode } from "react";

export type PaletteItem = {
  id: string;
  content: ReactNode;
  onSelect: () => void;
};

export type PaletteGroup = {
  id: string;
  label: string;
  items: PaletteItem[];
};

export function flattenGroups(groups: PaletteGroup[]): PaletteItem[] {
  return groups.flatMap((group) => group.items);
}

export function clampIndex(index: number, count: number): number {
  const lastIndex = Math.max(count - 1, 0);
  return Math.min(index, lastIndex);
}

export function stepIndex(current: number, delta: 1 | -1, count: number): number {
  const hasItems = count > 0;
  if (!hasItems) {
    return 0;
  }
  return (current + delta + count) % count;
}
