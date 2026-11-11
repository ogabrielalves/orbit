import { useEffect } from "react";
import type { PaletteGroup } from "@/pages/search/paletteModel";

type PaletteListProps = {
  listboxId: string;
  label: string;
  groups: PaletteGroup[];
  activeItemId: string | undefined;
  onActivate: (itemId: string) => void;
};

export function optionDomId(listboxId: string, itemId: string): string {
  return `${listboxId}-option-${itemId}`;
}

export function PaletteList({
  listboxId,
  label,
  groups,
  activeItemId,
  onActivate,
}: PaletteListProps) {
  useEffect(() => {
    if (activeItemId === undefined) {
      return;
    }
    const element = document.getElementById(optionDomId(listboxId, activeItemId));
    element?.scrollIntoView?.({ block: "nearest" });
  }, [listboxId, activeItemId]);

  return (
    <div id={listboxId} role="listbox" aria-label={label} className="flex flex-col gap-1 pb-2">
      {groups.map((group) => {
        const headingId = `${listboxId}-group-${group.id}`;

        return (
          <fieldset key={group.id} aria-labelledby={headingId} className="m-0 min-w-0 border-0 p-0">
            <div
              id={headingId}
              role="presentation"
              className="px-5 pt-3 pb-1 text-caption font-semibold tracking-wider text-fg-muted uppercase"
            >
              {group.label}
            </div>
            {group.items.map((item) => {
              const isActive = item.id === activeItemId;
              const activeClass = isActive ? "bg-primary-soft" : "";

              return (
                <div
                  key={item.id}
                  id={optionDomId(listboxId, item.id)}
                  role="option"
                  tabIndex={-1}
                  aria-selected={isActive}
                  onMouseMove={() => onActivate(item.id)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={item.onSelect}
                  onKeyDown={() => undefined}
                  className={`mx-2 flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 ${activeClass}`}
                >
                  {item.content}
                </div>
              );
            })}
          </fieldset>
        );
      })}
    </div>
  );
}
