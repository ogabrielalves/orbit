import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useTranslation } from "react-i18next";
import DragIcon from "@/assets/icons/linha/arrastar.svg?react";
import type { FavoriteEntry } from "@/bindings";
import { Badge } from "@/components/atoms/Badge";
import { Tooltip } from "@/components/atoms/Tooltip";
import { favoriteTypeIcons } from "@/lib/entityIcons";
import { favoriteKey } from "@/modules/favorites/favorites";
import { FavoriteLink } from "@/pages/favorites/FavoriteLink";
import { FavoriteToggle } from "@/pages/favorites/FavoriteToggle";

type FavoriteRowProps = {
  entry: FavoriteEntry;
};

export function FavoriteRow({ entry }: FavoriteRowProps) {
  const { t } = useTranslation();
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: favoriteKey(entry) });

  const Icon = favoriteTypeIcons[entry.entityType];
  const hasContext = entry.context !== null && entry.context !== "";
  const draggingClass = isDragging ? "opacity-50" : "";

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2.5 ${draggingClass}`}
    >
      <Tooltip label={t("favorites.reorder", { title: entry.title })} labelsTrigger>
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={t("favorites.reorder", { title: entry.title })}
          className="flex size-6 shrink-0 cursor-grab items-center justify-center rounded-sm text-fg-subtle hover:text-fg-muted active:cursor-grabbing"
        >
          <DragIcon aria-hidden="true" className="size-4" />
        </button>
      </Tooltip>
      <Icon aria-hidden="true" className="size-4.5 shrink-0 text-fg-muted" />
      <div className="flex min-w-0 flex-1 flex-col">
        <FavoriteLink
          entry={entry}
          className="truncate text-body font-medium text-fg hover:text-primary-fg"
        >
          {entry.title}
        </FavoriteLink>
        {hasContext && <span className="truncate text-caption text-fg-muted">{entry.context}</span>}
      </div>
      {entry.isArchived && (
        <Badge tone="outline" shape="pill">
          {t("favorites.archivedBadge")}
        </Badge>
      )}
      <FavoriteToggle entityType={entry.entityType} entityId={entry.entityId} name={entry.title} />
    </li>
  );
}
