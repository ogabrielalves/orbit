import FavoriteIcon from "@/assets/icons/linha/favoritos.svg?react";

type FavoriteButtonProps = {
  isFavorite: boolean;
  label: string;
  isDisabled?: boolean;
  onToggle: () => void;
};

export function FavoriteButton({
  isFavorite,
  label,
  isDisabled = false,
  onToggle,
}: FavoriteButtonProps) {
  const iconClass = isFavorite ? "fill-warning text-warning" : "text-fg-secondary";

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={isFavorite}
      disabled={isDisabled}
      onClick={onToggle}
      className="inline-flex size-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
    >
      <FavoriteIcon aria-hidden="true" className={`size-4.5 ${iconClass}`} />
    </button>
  );
}
