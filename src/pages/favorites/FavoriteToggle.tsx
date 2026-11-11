import { useTranslation } from "react-i18next";
import type { FavoriteType } from "@/bindings";
import { FavoriteButton } from "@/components/molecules/FavoriteButton";
import { useIsFavorite, useToggleFavorite } from "@/modules/favorites/queries";

type FavoriteToggleProps = {
  entityType: FavoriteType;
  entityId: string;
  name?: string;
};

export function FavoriteToggle({ entityType, entityId, name }: FavoriteToggleProps) {
  const { t } = useTranslation();
  const reference = { entityType, entityId };
  const isFavorite = useIsFavorite(reference);
  const toggleFavorite = useToggleFavorite();

  const baseLabel = t(isFavorite ? "favorites.toggle.remove" : "favorites.toggle.add");
  const hasName = name !== undefined;
  const label = hasName ? `${baseLabel}: ${name}` : baseLabel;

  return (
    <FavoriteButton
      isFavorite={isFavorite}
      label={label}
      isDisabled={toggleFavorite.isPending}
      onToggle={() => toggleFavorite.mutate(reference)}
    />
  );
}
