import {
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useMoveFolder } from "@/modules/folders/queries";
import { useMoveNote } from "@/modules/notes/queries";
import { type DragSource, remapPathAfterMove, resolveMove } from "@/pages/notes/noteMove";

const ACTIVATION_DISTANCE_IN_PIXELS = 6;

type DropTarget = { path: string; name: string };

type NoteMoveDndOptions = {
  selectedPath: string;
  onSelectedPathChange: (path: string) => void;
};

export function useNoteMoveDnd({ selectedPath, onSelectedPathChange }: NoteMoveDndOptions) {
  const { t } = useTranslation();
  const moveNote = useMoveNote();
  const moveFolder = useMoveFolder();
  const [activeSource, setActiveSource] = useState<DragSource | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: ACTIVATION_DISTANCE_IN_PIXELS } }),
    useSensor(KeyboardSensor),
  );

  function targetNameOf(over: { data: { current?: unknown } } | null): string {
    const target = over?.data.current as DropTarget | undefined;
    return target?.name ?? "";
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      t("notes.move.dnd.picked", { name: (active.data.current as DragSource).name }),
    onDragOver: ({ active, over }) => {
      const hasTarget = over !== null;
      if (!hasTarget) {
        return undefined;
      }
      return t("notes.move.dnd.over", {
        name: (active.data.current as DragSource).name,
        target: targetNameOf(over),
      });
    },
    onDragEnd: ({ active, over }) => {
      const name = (active.data.current as DragSource).name;
      const hasTarget = over !== null;
      return hasTarget
        ? t("notes.move.dnd.dropped", { name, target: targetNameOf(over) })
        : t("notes.move.dnd.cancelled", { name });
    },
    onDragCancel: ({ active }) =>
      t("notes.move.dnd.cancelled", { name: (active.data.current as DragSource).name }),
  };

  function handleDragStart({ active }: DragStartEvent) {
    setActiveSource((active.data.current as DragSource | undefined) ?? null);
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveSource(null);
    const source = active.data.current as DragSource | undefined;
    const target = over?.data.current as DropTarget | undefined;
    const hasSource = source !== undefined;
    const hasTarget = target !== undefined;
    if (!hasSource || !hasTarget) {
      return;
    }

    const action = resolveMove(source, target.path);
    const hasAction = action !== null;
    if (!hasAction) {
      return;
    }

    if (action.kind === "note") {
      moveNote.mutate(
        { id: action.id, newFolderPath: action.newFolderPath },
        {
          onSuccess: () =>
            toast.success(t("notes.move.toast.note", { name: action.name, target: target.name })),
        },
      );
      return;
    }

    moveFolder.mutate(
      { path: action.path, newParentPath: action.newParentPath },
      {
        onSuccess: (moved) => {
          toast.success(t("notes.move.toast.folder", { name: action.name, target: target.name }));
          const remapped = remapPathAfterMove(selectedPath, action.path, moved.path);
          const hasRemapped = remapped !== null;
          if (hasRemapped) {
            onSelectedPathChange(remapped);
          }
        },
      },
    );
  }

  return {
    sensors,
    activeSource,
    announcements,
    instructions: t("notes.move.dnd.instructions"),
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
    onDragCancel: () => setActiveSource(null),
  };
}
