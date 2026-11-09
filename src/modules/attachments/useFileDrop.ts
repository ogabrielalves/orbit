import { getCurrentWebview } from "@tauri-apps/api/webview";
import { useEffect, useRef, useState } from "react";

export function useFileDrop(onDrop: (paths: string[]) => void): boolean {
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const onDropRef = useRef(onDrop);

  useEffect(() => {
    onDropRef.current = onDrop;
  }, [onDrop]);

  useEffect(() => {
    let isActive = true;
    let unlisten: (() => void) | undefined;

    try {
      void getCurrentWebview()
        .onDragDropEvent((event) => {
          const payload = event.payload;
          const isEntering = payload.type === "enter" || payload.type === "over";
          const isLeaving = payload.type === "leave";
          if (isEntering) {
            setIsDraggingFiles(true);
          }
          if (isLeaving) {
            setIsDraggingFiles(false);
          }
          const isDropping = payload.type === "drop";
          if (isDropping) {
            setIsDraggingFiles(false);
            onDropRef.current(payload.paths);
          }
        })
        .then((stop) => {
          if (isActive) {
            unlisten = stop;
          } else {
            stop();
          }
        })
        .catch(() => undefined);
    } catch {
      unlisten = undefined;
    }

    return () => {
      isActive = false;
      unlisten?.();
    };
  }, []);

  return isDraggingFiles;
}
