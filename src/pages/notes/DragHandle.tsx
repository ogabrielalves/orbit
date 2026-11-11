import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import DragIcon from "@/assets/icons/linha/arrastar.svg?react";
import { Tooltip } from "@/components/atoms/Tooltip";

type DragHandleProps = {
  label: string;
  attributes: DraggableAttributes;
  listeners: SyntheticListenerMap | undefined;
  setActivatorNodeRef: (element: HTMLElement | null) => void;
};

export function DragHandle({ label, attributes, listeners, setActivatorNodeRef }: DragHandleProps) {
  return (
    <Tooltip label={label} labelsTrigger>
      <button
        type="button"
        ref={setActivatorNodeRef}
        aria-label={label}
        {...attributes}
        {...listeners}
        className="flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded-sm text-fg-muted opacity-0 outline-none group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-primary"
      >
        <DragIcon aria-hidden="true" className="size-3.5" />
      </button>
    </Tooltip>
  );
}
