import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FavoriteEntry } from "@/bindings";
import { favoriteKey } from "@/modules/favorites/favorites";
import {
  favoriteKeys,
  useFavorites,
  useIsFavorite,
  useMoveFavorite,
  useToggleFavorite,
} from "@/modules/favorites/queries";

const commands = vi.hoisted(() => ({
  listFavorites: vi.fn(),
  toggleFavorite: vi.fn(),
  moveFavorite: vi.fn(),
}));

vi.mock("@/bindings", () => ({ commands }));

function entry(entityId: string): FavoriteEntry {
  return {
    entityType: "project",
    entityId,
    title: entityId,
    context: null,
    projectId: null,
    boardId: null,
    parentTaskId: null,
    path: null,
    isArchived: false,
    createdAt: "2026-11-08T12:00:00Z",
  };
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe("favorites queries", () => {
  beforeEach(() => {
    for (const command of Object.values(commands)) {
      command.mockReset();
    }
    commands.listFavorites.mockResolvedValue({ status: "ok", data: [entry("a"), entry("b")] });
  });

  it("lists the favorites", async () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useFavorites(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(2);
    expect(favoriteKeys.all).toEqual(["favorites"]);
  });

  it("tells whether a reference is a favorite", async () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(
      () => ({
        a: useIsFavorite({ entityType: "project", entityId: "a" }),
        z: useIsFavorite({ entityType: "project", entityId: "z" }),
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.a).toBe(true));
    expect(result.current.z).toBe(false);
  });

  it("refreshes the list after toggling", async () => {
    commands.toggleFavorite.mockResolvedValue({ status: "ok", data: true });
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useToggleFavorite(), { wrapper });

    await act(() => result.current.mutateAsync({ entityType: "project", entityId: "a" }));

    expect(commands.toggleFavorite).toHaveBeenCalledWith({ entityType: "project", entityId: "a" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: favoriteKeys.all });
  });

  it("reorders the cached list right away", async () => {
    let finishMove: (value: unknown) => void = () => undefined;
    commands.moveFavorite.mockReturnValue(
      new Promise((resolve) => {
        finishMove = resolve;
      }),
    );
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData(favoriteKeys.all, [entry("a"), entry("b")]);
    const { result } = renderHook(() => useMoveFavorite(), { wrapper });

    act(() => {
      result.current.mutate({
        reference: { entityType: "project", entityId: "b" },
        afterReference: null,
      });
    });

    await waitFor(() =>
      expect(queryClient.getQueryData<FavoriteEntry[]>(favoriteKeys.all)?.map(favoriteKey)).toEqual(
        ["project:b", "project:a"],
      ),
    );
    finishMove({ status: "ok", data: null });
  });

  it("restores the list when the move fails", async () => {
    commands.moveFavorite.mockResolvedValue({
      status: "error",
      error: { code: "NOT_FOUND", message: "gone" },
    });
    commands.listFavorites.mockResolvedValue({ status: "ok", data: [entry("a"), entry("b")] });
    const { queryClient, wrapper } = createWrapper();
    queryClient.setQueryData(favoriteKeys.all, [entry("a"), entry("b")]);
    const { result } = renderHook(() => useMoveFavorite(), { wrapper });

    await act(async () => {
      await result.current
        .mutateAsync({
          reference: { entityType: "project", entityId: "b" },
          afterReference: null,
        })
        .catch(() => undefined);
    });

    await waitFor(() =>
      expect(queryClient.getQueryData<FavoriteEntry[]>(favoriteKeys.all)?.map(favoriteKey)).toEqual(
        ["project:a", "project:b"],
      ),
    );
  });
});
