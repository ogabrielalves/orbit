import CloseIcon from "@/assets/icons/linha/fechar.svg?react";
import { resolveProjectColor } from "@/modules/projects/colors";

type TagChipProps = {
  name: string;
  color: string | null;
  removeLabel?: string;
  onRemove?: () => void;
};

export function TagChip({ name, color, removeLabel, onRemove }: TagChipProps) {
  const canRemove = onRemove !== undefined && removeLabel !== undefined;

  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface-muted py-1 pr-2.5 pl-2.5 text-caption font-medium text-fg-secondary">
      <span
        aria-hidden="true"
        style={{ backgroundColor: resolveProjectColor(color) }}
        className="size-2 shrink-0 rounded-full"
      />
      <span className="truncate">{name}</span>
      {canRemove && (
        <button
          type="button"
          aria-label={removeLabel}
          onClick={onRemove}
          className="-mr-1 flex size-4 shrink-0 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-border hover:text-fg"
        >
          <CloseIcon aria-hidden="true" className="size-3" />
        </button>
      )}
    </span>
  );
}
