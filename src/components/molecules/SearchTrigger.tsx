import SearchIcon from "@/assets/icons/linha/busca.svg?react";

type SearchTriggerProps = {
  label: string;
  shortcut: string;
  onClick: () => void;
};

export function SearchTrigger({ label, shortcut, onClick }: SearchTriggerProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-9 items-center gap-2 rounded-md border border-border-strong bg-surface px-3 text-body text-fg-muted transition-colors hover:bg-surface-muted"
    >
      <SearchIcon aria-hidden="true" className="size-4 shrink-0" />
      <span className="hidden sm:inline">{label}</span>
      <kbd className="hidden rounded-xs border border-border bg-surface-muted px-1.5 py-px font-sans text-micro text-fg-secondary md:inline">
        {shortcut}
      </kbd>
    </button>
  );
}
