import { defaultRangeExtractor, type Range, useVirtualizer } from "@tanstack/react-virtual";
import { type ReactNode, useCallback, useEffect, useRef } from "react";

export const LIST_PRIMARY_ATTRIBUTE = "data-list-primary";

const OVERSCAN = 8;

type VirtualListProps<TItem> = {
  items: TItem[];
  getKey: (item: TItem) => string;
  estimateSize: number;
  gap?: number;
  label: string;
  scrollClassName: string;
  pinnedKey?: string | null;
  scrollToKey?: string | null;
  renderItem: (item: TItem) => ReactNode;
};

function firstIndexOf<TItem>(items: TItem[], getKey: (item: TItem) => string, key: string): number {
  return items.findIndex((item) => getKey(item) === key);
}

export function VirtualList<TItem>({
  items,
  getKey,
  estimateSize,
  gap = 0,
  label,
  scrollClassName,
  pinnedKey = null,
  scrollToKey = null,
  renderItem,
}: VirtualListProps<TItem>) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingFocusIndex = useRef<number | null>(null);
  const itemsRef = useRef({ items, getKey });
  const pinnedIndex = pinnedKey === null ? -1 : firstIndexOf(items, getKey, pinnedKey);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    gap,
    overscan: OVERSCAN,
    getItemKey: (index) => {
      const item = items[index];
      return item === undefined ? index : getKey(item);
    },
    rangeExtractor: (range: Range) => {
      const indexes = defaultRangeExtractor(range);
      const isPinnedMissing = pinnedIndex >= 0 && !indexes.includes(pinnedIndex);
      return isPinnedMissing ? [...indexes, pinnedIndex].sort((a, b) => a - b) : indexes;
    },
  });

  useEffect(() => {
    itemsRef.current = { items, getKey };
  });

  useEffect(() => {
    if (scrollToKey === null) {
      return;
    }
    const current = itemsRef.current;
    const index = firstIndexOf(current.items, current.getKey, scrollToKey);
    if (index >= 0) {
      virtualizer.scrollToIndex(index, { align: "auto" });
    }
  }, [scrollToKey, virtualizer]);

  const focusPending = useCallback(() => {
    const index = pendingFocusIndex.current;
    if (index === null) {
      return;
    }
    const target = scrollRef.current?.querySelector<HTMLElement>(
      `li[data-index="${index}"] [${LIST_PRIMARY_ATTRIBUTE}]`,
    );
    if (target !== null && target !== undefined) {
      pendingFocusIndex.current = null;
      target.focus();
    }
  }, []);

  useEffect(() => {
    focusPending();
  });

  useEffect(() => {
    const scroller = scrollRef.current;
    if (scroller === null) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const isPrimary =
        target instanceof HTMLElement && target.hasAttribute(LIST_PRIMARY_ATTRIBUTE);
      const row = isPrimary ? target.closest<HTMLElement>("li[data-index]") : null;
      if (row === null) {
        return;
      }

      const current = Number(row.dataset.index);
      const lastIndex = itemsRef.current.items.length - 1;
      const nextByKey: Record<string, number> = {
        ArrowDown: Math.min(current + 1, lastIndex),
        ArrowUp: Math.max(current - 1, 0),
        Home: 0,
        End: lastIndex,
      };
      const next = nextByKey[event.key];
      if (next === undefined) {
        return;
      }

      event.preventDefault();
      pendingFocusIndex.current = next;
      virtualizer.scrollToIndex(next, { align: "auto" });
      focusPending();
    }

    scroller.addEventListener("keydown", handleKeyDown);
    return () => scroller.removeEventListener("keydown", handleKeyDown);
  }, [virtualizer, focusPending]);

  return (
    <div ref={scrollRef} data-virtual-scroll="" className={scrollClassName}>
      <ul
        aria-label={label}
        style={{ height: virtualizer.getTotalSize() }}
        className="relative m-0 w-full list-none p-0"
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const item = items[virtualItem.index];
          if (item === undefined) {
            return null;
          }
          return (
            <li
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              aria-setsize={items.length}
              aria-posinset={virtualItem.index + 1}
              style={{ transform: `translateY(${virtualItem.start}px)` }}
              className="absolute top-0 left-0 w-full"
            >
              {renderItem(item)}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
