import { useTranslation } from "react-i18next";
import type { NoteSummary } from "@/bindings";

const POPUP_OFFSET = 6;

type WikiLinkSuggestProps = {
  items: NoteSummary[];
  activeIndex: number;
  left: number;
  bottom: number;
  onSelect: (title: string) => void;
};

export function WikiLinkSuggest({
  items,
  activeIndex,
  left,
  bottom,
  onSelect,
}: WikiLinkSuggestProps) {
  const { t } = useTranslation();
  const hasItems = items.length > 0;

  return (
    <div
      className="fixed z-50 w-72 rounded-lg border border-border bg-surface p-1.5 shadow-md"
      style={{ left, top: bottom + POPUP_OFFSET }}
    >
      {hasItems ? (
        <div role="listbox" aria-label={t("notes.links.suggest.label")} className="flex flex-col">
          {items.map((note, index) => {
            const isActive = index === activeIndex;
            const itemClass = isActive ? "bg-surface-muted" : "";

            return (
              <div
                key={note.id}
                role="option"
                tabIndex={-1}
                aria-selected={isActive}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelect(note.title);
                }}
                className={`flex cursor-pointer flex-col rounded-sm px-2.5 py-1.5 ${itemClass}`}
              >
                <span className="truncate text-small text-fg">{note.title}</span>
                <span className="truncate text-caption text-fg-muted">{note.path}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="px-2.5 py-2 text-small text-fg-muted">{t("notes.links.suggest.empty")}</p>
      )}
    </div>
  );
}
