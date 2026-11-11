import {
  type Announcements,
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useTranslation } from "react-i18next";
import type { FavoriteEntry } from "@/bindings";
import { Skeleton } from "@/components/atoms/Skeleton";
import { EmptyState } from "@/components/molecules/EmptyState";
import { ErrorState } from "@/components/molecules/ErrorState";
import { PageHeader } from "@/components/molecules/PageHeader";
import { getErrorMessageKey } from "@/lib/appError";
import { favoriteKey, getFavoriteMove, groupFavorites } from "@/modules/favorites/favorites";
import { useFavorites, useMoveFavorite } from "@/modules/favorites/queries";
import { FavoriteRow } from "@/pages/favorites/FavoriteRow";

const placeholderIds = ["a", "b", "c"];

export function FavoritesPage() {
  const { t } = useTranslation();
  const favoritesQuery = useFavorites();
  const moveFavorite = useMoveFavorite();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] },
    }),
  );

  const entries: FavoriteEntry[] = favoritesQuery.data ?? [];
  const groups = groupFavorites(entries);
  const isLoading = favoritesQuery.isPending;
  const hasFailed = favoritesQuery.isError;
  const hasLoaded = favoritesQuery.isSuccess;
  const hasEntries = entries.length > 0;
  const hasNoEntries = hasLoaded && !hasEntries;

  function titleOf(id: unknown): string {
    return entries.find((entry) => favoriteKey(entry) === id)?.title ?? "";
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => t("favorites.dnd.picked", { title: titleOf(active.id) }),
    onDragOver: ({ active, over }) =>
      over === null
        ? undefined
        : t("favorites.dnd.over", { title: titleOf(active.id), over: titleOf(over.id) }),
    onDragEnd: ({ active, over }) =>
      over === null
        ? t("favorites.dnd.cancelled", { title: titleOf(active.id) })
        : t("favorites.dnd.dropped", { title: titleOf(active.id), over: titleOf(over.id) }),
    onDragCancel: ({ active }) => t("favorites.dnd.cancelled", { title: titleOf(active.id) }),
  };

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (over === null) {
      return;
    }
    const group = groups.find((candidate) =>
      candidate.entries.some((entry) => favoriteKey(entry) === String(active.id)),
    );
    if (group === undefined) {
      return;
    }
    const move = getFavoriteMove(group.entries, String(active.id), String(over.id));
    if (move !== null) {
      moveFavorite.mutate(move);
    }
  }

  return (
    <>
      <PageHeader
        title={t("nav.favorites")}
        subtitle={hasLoaded ? t("favorites.count", { count: entries.length }) : undefined}
      />
      {isLoading && (
        <div role="status" aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">{t("common.loading")}</span>
          {placeholderIds.map((id) => (
            <Skeleton key={id} className="h-14 w-full" />
          ))}
        </div>
      )}
      {hasFailed && (
        <ErrorState
          title={t("favorites.loadError")}
          description={t(getErrorMessageKey(favoritesQuery.error))}
          onRetry={() => void favoritesQuery.refetch()}
        />
      )}
      {hasNoEntries && (
        <EmptyState
          title={t("favorites.empty.title")}
          description={t("favorites.empty.description")}
        />
      )}
      {hasEntries && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          accessibility={{
            announcements,
            screenReaderInstructions: { draggable: t("favorites.dnd.instructions") },
          }}
        >
          <div className="flex flex-col gap-6">
            {groups.map((group) => (
              <section key={group.type} aria-label={t(`favorites.groups.${group.type}`)}>
                <h2 className="mb-2 font-display text-heading-3 font-semibold text-fg">
                  {t(`favorites.groups.${group.type}`)}
                </h2>
                <SortableContext
                  items={group.entries.map(favoriteKey)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="flex flex-col gap-2">
                    {group.entries.map((entry) => (
                      <FavoriteRow key={favoriteKey(entry)} entry={entry} />
                    ))}
                  </ul>
                </SortableContext>
              </section>
            ))}
          </div>
        </DndContext>
      )}
    </>
  );
}
