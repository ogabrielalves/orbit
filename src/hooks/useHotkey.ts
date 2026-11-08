import { useEffect, useRef } from "react";
import { matchesHotkey } from "@/lib/hotkey";

export function useHotkey(combo: string, handler: () => void): void {
  const handlerRef = useRef(handler);

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isMatch = matchesHotkey(combo, event);
      if (!isMatch) {
        return;
      }
      event.preventDefault();
      handlerRef.current();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [combo]);
}
