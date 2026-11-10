import { useCallback, useEffect, useRef, useState } from "react";
import type { NoteDetails } from "@/bindings";
import { isAppError } from "@/lib/appError";
import { registerCloseGuard } from "@/lib/closeGuards";
import { useSaveNote } from "@/modules/notes/queries";

export const AUTOSAVE_DELAY_IN_MILLISECONDS = 1000;
const MAX_FLUSH_ATTEMPTS = 3;

export type SaveStatus = "saved" | "dirty" | "saving" | "error" | "conflict";

export function useNoteAutosave(note: NoteDetails) {
  const saveNote = useSaveNote();
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [editorVersion, setEditorVersion] = useState(0);
  const [initialContent, setInitialContent] = useState(note.content);
  const statusRef = useRef<SaveStatus>("saved");
  const baseRef = useRef({ hash: note.hash, content: note.content });
  const draftRef = useRef(note.content);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const isDiscardedRef = useRef(false);
  const saveRef = useRef<(shouldForce?: boolean) => Promise<boolean>>(async () => true);
  const noteId = note.id;

  const updateStatus = useCallback((next: SaveStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const clearTimer = useCallback(() => {
    const hasTimer = timerRef.current !== null;
    if (hasTimer) {
      clearTimeout(timerRef.current as ReturnType<typeof setTimeout>);
      timerRef.current = null;
    }
  }, []);

  const scheduleSave = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      void saveRef.current();
    }, AUTOSAVE_DELAY_IN_MILLISECONDS);
  }, [clearTimer]);

  const performSave = useCallback(
    async (shouldForce: boolean): Promise<boolean> => {
      clearTimer();
      const content = draftRef.current;
      const isUnchanged = content === baseRef.current.content;
      const canSkip = isUnchanged && !shouldForce;
      if (canSkip) {
        updateStatus("saved");
        return true;
      }
      isSavingRef.current = true;
      updateStatus("saving");
      try {
        const saved = await saveNote.mutateAsync({
          id: noteId,
          input: { content, baseHash: baseRef.current.hash, force: shouldForce },
        });
        baseRef.current = { hash: saved.hash, content };
        isSavingRef.current = false;
        const hasNewerDraft = draftRef.current !== content;
        updateStatus(hasNewerDraft ? "dirty" : "saved");
        if (hasNewerDraft) {
          scheduleSave();
        }
        return !hasNewerDraft;
      } catch (error) {
        isSavingRef.current = false;
        const isConflict = isAppError(error) && error.code === "CONFLICT";
        updateStatus(isConflict ? "conflict" : "error");
        return false;
      }
    },
    [clearTimer, noteId, saveNote, scheduleSave, updateStatus],
  );

  const save = useCallback(
    (shouldForce = false): Promise<boolean> => {
      const isSaving = isSavingRef.current;
      if (isSaving) {
        return inFlightRef.current ?? Promise.resolve(false);
      }
      const attempt = performSave(shouldForce);
      inFlightRef.current = attempt;
      return attempt;
    },
    [performSave],
  );

  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const handleChange = useCallback(
    (markdown: string) => {
      draftRef.current = markdown;
      const currentStatus = statusRef.current;
      const isSaving = currentStatus === "saving";
      const isInConflict = currentStatus === "conflict";
      if (isSaving || isInConflict) {
        return;
      }

      const isBackToSaved = markdown === baseRef.current.content;
      if (isBackToSaved) {
        clearTimer();
        updateStatus("saved");
        return;
      }
      updateStatus("dirty");
      scheduleSave();
    },
    [clearTimer, scheduleSave, updateStatus],
  );

  const adopt = useCallback(
    (fresh: NoteDetails) => {
      clearTimer();
      baseRef.current = { hash: fresh.hash, content: fresh.content };
      draftRef.current = fresh.content;
      setInitialContent(fresh.content);
      setEditorVersion((version) => version + 1);
      updateStatus("saved");
    },
    [clearTimer, updateStatus],
  );

  useEffect(() => {
    const isExternalChange = note.hash !== baseRef.current.hash;
    const isClean = statusRef.current === "saved";
    const shouldAdopt = isExternalChange && isClean;
    if (shouldAdopt) {
      adopt(note);
    }
  }, [note, adopt]);

  useEffect(() => {
    function flushWhenHidden() {
      const isHidden = document.visibilityState === "hidden";
      const hasPendingChanges = statusRef.current === "dirty";
      if (isHidden && hasPendingChanges) {
        void saveRef.current();
      }
    }
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => document.removeEventListener("visibilitychange", flushWhenHidden);
  }, []);

  useEffect(
    () => () => {
      clearTimer();
      const isDiscarded = isDiscardedRef.current;
      const currentStatus = statusRef.current;
      const hasUnsavedChanges = currentStatus === "dirty" || currentStatus === "error";
      const shouldFlush = hasUnsavedChanges && !isDiscarded;
      if (shouldFlush) {
        void saveRef.current();
      }
    },
    [clearTimer],
  );

  useEffect(
    () =>
      registerCloseGuard({
        hasPending: () => statusRef.current !== "saved",
        flush: async () => {
          for (let attempt = 0; attempt < MAX_FLUSH_ATTEMPTS; attempt += 1) {
            await saveRef.current();
            const isSaved = statusRef.current === "saved";
            const isBlocked = statusRef.current === "error" || statusRef.current === "conflict";
            if (isSaved) {
              return true;
            }
            if (isBlocked) {
              return false;
            }
          }
          return false;
        },
      }),
    [],
  );

  const discard = useCallback(() => {
    isDiscardedRef.current = true;
    clearTimer();
  }, [clearTimer]);

  return {
    status,
    editorVersion,
    initialContent,
    handleChange,
    saveNow: () => save(false),
    overwrite: () => save(true),
    adopt,
    discard,
  };
}
