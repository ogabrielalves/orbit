import { useCallback, useMemo, useRef, useState } from "react";
import type { NoteSummary } from "@/bindings";
import type { WikiLinkSuggestState } from "@/pages/notes/editor/wikiLinkPlugin";
import { filterNoteSuggestions } from "@/pages/notes/links/wikiLink";

export function useWikiLinkSuggest(notes: NoteSummary[]) {
  const [suggest, setSuggest] = useState<WikiLinkSuggestState | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const suggestRef = useRef<WikiLinkSuggestState | null>(null);
  const activeIndexRef = useRef(0);

  const query = suggest?.query ?? "";
  const items = useMemo(() => filterNoteSuggestions(notes, query), [notes, query]);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const updateActiveIndex = useCallback((index: number) => {
    activeIndexRef.current = index;
    setActiveIndex(index);
  }, []);

  const onSuggest = useCallback(
    (next: WikiLinkSuggestState | null) => {
      const previousQuery = suggestRef.current?.query;
      const hasQueryChanged = next?.query !== previousQuery;
      suggestRef.current = next;
      setSuggest(next);
      if (hasQueryChanged) {
        updateActiveIndex(0);
      }
    },
    [updateActiveIndex],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent) => {
      const current = suggestRef.current;
      const isOpen = current !== null;
      if (!isOpen) {
        return false;
      }

      const list = itemsRef.current;
      const count = list.length;
      const hasItems = count > 0;
      const isEscape = event.key === "Escape";
      const isConfirm = event.key === "Enter" || event.key === "Tab";
      const isDown = event.key === "ArrowDown";
      const isUp = event.key === "ArrowUp";

      if (isEscape) {
        suggestRef.current = null;
        setSuggest(null);
        return true;
      }
      if (!hasItems) {
        return false;
      }
      if (isDown) {
        updateActiveIndex((activeIndexRef.current + 1) % count);
        return true;
      }
      if (isUp) {
        updateActiveIndex((activeIndexRef.current - 1 + count) % count);
        return true;
      }
      if (isConfirm) {
        const chosen = list.at(activeIndexRef.current) ?? list.at(0);
        const hasChosen = chosen !== undefined;
        if (hasChosen) {
          current.apply(chosen.title);
        }
        return hasChosen;
      }
      return false;
    },
    [updateActiveIndex],
  );

  return { suggest, items, activeIndex, onSuggest, onKeyDown };
}
