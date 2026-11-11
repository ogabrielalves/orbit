import { fail } from "./failure";

const RANK_STEP = 1000;
const RANK_DIGITS = 10;

export function rank(index: number): string {
  return String((index + 1) * RANK_STEP).padStart(RANK_DIGITS, "0");
}

export function byPosition<T extends { position: string; id: string }>(a: T, b: T): number {
  if (a.position !== b.position) {
    return a.position < b.position ? -1 : 1;
  }
  return a.id < b.id ? -1 : 1;
}

export function reposition<T extends { position: string }>(ordered: T[]): void {
  ordered.forEach((item, index) => {
    item.position = rank(index);
  });
}

export function previousSiblingId<T extends { id: string }>(
  ordered: T[],
  id: string,
): string | null {
  const index = ordered.findIndex((item) => item.id === id);
  return index > 0 ? (ordered[index - 1]?.id ?? null) : null;
}

export function placeAfter<T extends { id: string }>(
  siblings: T[],
  moving: T,
  afterId: string | null,
): T[] {
  const rest = siblings.filter((item) => item.id !== moving.id);
  if (afterId === null) {
    return [moving, ...rest];
  }
  const index = rest.findIndex((item) => item.id === afterId);
  if (index === -1) {
    fail("INVALID_MOVE", "the reference sibling is not in the destination");
  }
  return [...rest.slice(0, index + 1), moving, ...rest.slice(index + 1)];
}
