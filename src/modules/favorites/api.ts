import { commands, type FavoriteEntry, type FavoriteRef } from "@/bindings";
import { unwrapResult } from "@/lib/unwrapResult";

export async function fetchFavorites(): Promise<FavoriteEntry[]> {
  return unwrapResult(await commands.listFavorites());
}

export async function toggleFavorite(reference: FavoriteRef): Promise<boolean> {
  return unwrapResult(await commands.toggleFavorite(reference));
}

export async function moveFavorite(
  reference: FavoriteRef,
  afterReference: FavoriteRef | null,
): Promise<null> {
  return unwrapResult(await commands.moveFavorite(reference, afterReference));
}
