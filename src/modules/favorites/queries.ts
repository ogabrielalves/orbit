import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FavoriteEntry, FavoriteRef } from "@/bindings";
import { fetchFavorites, moveFavorite, toggleFavorite } from "@/modules/favorites/api";
import { applyFavoriteMove, type FavoriteMove, isFavorite } from "@/modules/favorites/favorites";

export const favoriteKeys = {
  all: ["favorites"] as const,
};

type MoveContext = { previous: FavoriteEntry[] | undefined };

export function useFavorites() {
  return useQuery({ queryKey: favoriteKeys.all, queryFn: fetchFavorites });
}

export function useIsFavorite(reference: FavoriteRef): boolean {
  const favoritesQuery = useFavorites();
  return isFavorite(favoritesQuery.data ?? [], reference);
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (reference: FavoriteRef) => toggleFavorite(reference),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: favoriteKeys.all }),
  });
}

export function useMoveFavorite() {
  const queryClient = useQueryClient();

  return useMutation<null, unknown, FavoriteMove, MoveContext>({
    mutationFn: ({ reference, afterReference }) => moveFavorite(reference, afterReference),
    onMutate: async (move) => {
      await queryClient.cancelQueries({ queryKey: favoriteKeys.all });
      const previous = queryClient.getQueryData<FavoriteEntry[]>(favoriteKeys.all);
      if (previous !== undefined) {
        queryClient.setQueryData<FavoriteEntry[]>(
          favoriteKeys.all,
          applyFavoriteMove(previous, move),
        );
      }
      return { previous };
    },
    onError: (_error, _move, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(favoriteKeys.all, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: favoriteKeys.all }),
  });
}
