import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardColumn, BoardDetails } from "@/bindings";
import {
  boardKeys,
  useBoard,
  useCreateBoard,
  useCreateColumn,
  useDeleteBoard,
  useDeleteColumn,
  useMoveColumn,
  useUpdateBoard,
  useUpdateColumn,
} from "@/modules/boards/queries";
import { projectKeys } from "@/modules/projects/queries";

const commands = vi.hoisted(() => ({
  getBoard: vi.fn(),
  createBoard: vi.fn(),
  updateBoard: vi.fn(),
  deleteBoard: vi.fn(),
  createColumn: vi.fn(),
  updateColumn: vi.fn(),
  moveColumn: vi.fn(),
  deleteColumn: vi.fn(),
}));

vi.mock("@/bindings", () => ({ commands }));

function column(id: string, overrides: Partial<BoardColumn> = {}): BoardColumn {
  return {
    id,
    boardId: "b1",
    name: id.toUpperCase(),
    position: id,
    color: null,
    createdAt: "2026-11-08T10:00:00Z",
    updatedAt: "2026-11-08T10:00:00Z",
    taskCount: 0,
    ...overrides,
  };
}

function details(columnIds: string[] = ["a", "b", "c"]): BoardDetails {
  return {
    board: {
      id: "b1",
      projectId: "p1",
      name: "Sprint",
      createdAt: "2026-11-08T10:00:00Z",
      updatedAt: "2026-11-08T10:00:00Z",
    },
    columns: columnIds.map((id) => column(id)),
  };
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

function columnIds(queryClient: QueryClient): string[] | undefined {
  return queryClient
    .getQueryData<BoardDetails>(boardKeys.detail("b1"))
    ?.columns.map((item) => item.id);
}

describe("board queries", () => {
  beforeEach(() => {
    for (const command of Object.values(commands)) {
      command.mockReset();
    }
  });

  describe("useBoard", () => {
    it("loads the board with its columns", async () => {
      commands.getBoard.mockResolvedValue({ status: "ok", data: details() });
      const { wrapper } = createWrapper();

      const { result } = renderHook(() => useBoard("b1"), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(details());
      expect(commands.getBoard).toHaveBeenCalledWith("b1");
    });

    it("exposes a not found error", async () => {
      const payload = { code: "NOT_FOUND", message: "board not found" };
      commands.getBoard.mockResolvedValue({ status: "error", error: payload });
      const { wrapper } = createWrapper();

      const { result } = renderHook(() => useBoard("missing"), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toBe(payload);
    });

    it("does not load anything while disabled", () => {
      const { wrapper } = createWrapper();

      const { result } = renderHook(() => useBoard("b1", false), { wrapper });

      expect(result.current.fetchStatus).toBe("idle");
      expect(commands.getBoard).not.toHaveBeenCalled();
    });
  });

  describe("board mutations", () => {
    it("creates a board, caches it and refreshes the projects", async () => {
      commands.createBoard.mockResolvedValue({ status: "ok", data: details(["a"]) });
      const { queryClient, wrapper } = createWrapper();
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");
      const { result } = renderHook(() => useCreateBoard(), { wrapper });

      await act(() =>
        result.current.mutateAsync({ projectId: "p1", name: "Sprint", columnNames: ["A"] }),
      );

      expect(commands.createBoard).toHaveBeenCalledWith({
        projectId: "p1",
        name: "Sprint",
        columnNames: ["A"],
      });
      expect(queryClient.getQueryData(boardKeys.detail("b1"))).toEqual(details(["a"]));
      expect(invalidate).toHaveBeenCalledWith({ queryKey: projectKeys.all });
    });

    it("renames a board and refreshes it and the projects that list it", async () => {
      commands.updateBoard.mockResolvedValue({ status: "ok", data: details().board });
      const { queryClient, wrapper } = createWrapper();
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");
      const { result } = renderHook(() => useUpdateBoard(), { wrapper });

      await act(() => result.current.mutateAsync({ id: "b1", input: { name: "New" } }));

      expect(commands.updateBoard).toHaveBeenCalledWith("b1", { name: "New" });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: boardKeys.detail("b1") });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: projectKeys.all });
    });

    it("removes a deleted board from the cache and refreshes the projects", async () => {
      commands.deleteBoard.mockResolvedValue({ status: "ok", data: null });
      const { queryClient, wrapper } = createWrapper();
      queryClient.setQueryData(boardKeys.detail("b1"), details());
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");
      const { result } = renderHook(() => useDeleteBoard(), { wrapper });

      await act(() => result.current.mutateAsync("b1"));

      expect(commands.deleteBoard).toHaveBeenCalledWith("b1");
      expect(queryClient.getQueryData(boardKeys.detail("b1"))).toBeUndefined();
      expect(invalidate).toHaveBeenCalledWith({ queryKey: projectKeys.all });
    });
  });

  describe("column mutations", () => {
    async function mountedBoard() {
      commands.getBoard.mockResolvedValue({ status: "ok", data: details() });
      const wrapperParts = createWrapper();
      const board = renderHook(() => useBoard("b1"), { wrapper: wrapperParts.wrapper });
      await waitFor(() => expect(board.result.current.isSuccess).toBe(true));
      return wrapperParts;
    }

    it("creates a column on the board and refreshes it", async () => {
      commands.createColumn.mockResolvedValue({ status: "ok", data: column("d") });
      const { wrapper } = await mountedBoard();
      const { result } = renderHook(() => useCreateColumn("b1"), { wrapper });

      await act(() => result.current.mutateAsync({ name: "QA", color: "ember" }));

      expect(commands.createColumn).toHaveBeenCalledWith({
        boardId: "b1",
        name: "QA",
        color: "ember",
      });
      expect(commands.getBoard).toHaveBeenCalledTimes(2);
    });

    it("updates a column and refreshes the board", async () => {
      commands.updateColumn.mockResolvedValue({ status: "ok", data: column("a") });
      const { wrapper } = await mountedBoard();
      const { result } = renderHook(() => useUpdateColumn("b1"), { wrapper });

      await act(() => result.current.mutateAsync({ id: "a", input: { color: null } }));

      expect(commands.updateColumn).toHaveBeenCalledWith("a", { color: null });
      expect(commands.getBoard).toHaveBeenCalledTimes(2);
    });

    it("deletes a column and refreshes the board", async () => {
      commands.deleteColumn.mockResolvedValue({ status: "ok", data: null });
      const { wrapper } = await mountedBoard();
      const { result } = renderHook(() => useDeleteColumn("b1"), { wrapper });

      await act(() => result.current.mutateAsync("a"));

      expect(commands.deleteColumn).toHaveBeenCalledWith("a");
      expect(commands.getBoard).toHaveBeenCalledTimes(2);
    });

    it("does not refresh the board when deleting a column fails", async () => {
      const payload = { code: "CONFLICT", message: "column still has tasks" };
      commands.deleteColumn.mockResolvedValue({ status: "error", error: payload });
      const { wrapper } = await mountedBoard();
      const { result } = renderHook(() => useDeleteColumn("b1"), { wrapper });

      await expect(act(() => result.current.mutateAsync("a"))).rejects.toBe(payload);

      expect(commands.getBoard).toHaveBeenCalledTimes(1);
    });
  });

  describe("useMoveColumn", () => {
    async function mountedBoard() {
      commands.getBoard.mockResolvedValue({ status: "ok", data: details() });
      const parts = createWrapper();
      const board = renderHook(() => useBoard("b1"), { wrapper: parts.wrapper });
      await waitFor(() => expect(board.result.current.isSuccess).toBe(true));
      return parts;
    }

    it("shows the new order before the backend answers", async () => {
      commands.moveColumn.mockReturnValue(new Promise(() => undefined));
      const { queryClient, wrapper } = await mountedBoard();
      const { result } = renderHook(() => useMoveColumn("b1"), { wrapper });

      act(() => result.current.mutate({ id: "a", afterColumnId: "c" }));

      await waitFor(() => expect(columnIds(queryClient)).toEqual(["b", "c", "a"]));
      expect(commands.moveColumn).toHaveBeenCalledWith("a", "c");
    });

    it("moves a column to the first place", async () => {
      commands.moveColumn.mockReturnValue(new Promise(() => undefined));
      const { queryClient, wrapper } = await mountedBoard();
      const { result } = renderHook(() => useMoveColumn("b1"), { wrapper });

      act(() => result.current.mutate({ id: "c", afterColumnId: null }));

      await waitFor(() => expect(columnIds(queryClient)).toEqual(["c", "a", "b"]));
    });

    it("keeps the new order and confirms it with the backend after success", async () => {
      commands.moveColumn.mockResolvedValue({ status: "ok", data: column("a") });
      const { queryClient, wrapper } = await mountedBoard();
      commands.getBoard.mockResolvedValue({ status: "ok", data: details(["b", "c", "a"]) });
      const { result } = renderHook(() => useMoveColumn("b1"), { wrapper });

      await act(() => result.current.mutateAsync({ id: "a", afterColumnId: "c" }));

      await waitFor(() => expect(commands.getBoard).toHaveBeenCalledTimes(2));
      expect(columnIds(queryClient)).toEqual(["b", "c", "a"]);
    });

    it("rolls back to the previous order when the backend refuses", async () => {
      const payload = { code: "NOT_FOUND", message: "column not found" };
      commands.moveColumn.mockResolvedValue({ status: "error", error: payload });
      const { queryClient, wrapper } = await mountedBoard();
      const { result } = renderHook(() => useMoveColumn("b1"), { wrapper });

      await expect(
        act(() => result.current.mutateAsync({ id: "a", afterColumnId: "c" })),
      ).rejects.toBe(payload);

      await waitFor(() => expect(columnIds(queryClient)).toEqual(["a", "b", "c"]));
    });

    it("still refreshes the board after a failure to show the real state", async () => {
      commands.moveColumn.mockResolvedValue({
        status: "error",
        error: { code: "DATABASE", message: "x" },
      });
      const { wrapper } = await mountedBoard();
      const { result } = renderHook(() => useMoveColumn("b1"), { wrapper });

      await expect(
        act(() => result.current.mutateAsync({ id: "a", afterColumnId: "c" })),
      ).rejects.toBeDefined();

      await waitFor(() => expect(commands.getBoard).toHaveBeenCalledTimes(2));
    });

    it("works even when the board is not in the cache", async () => {
      commands.moveColumn.mockResolvedValue({ status: "ok", data: column("a") });
      commands.getBoard.mockResolvedValue({ status: "ok", data: details() });
      const { queryClient, wrapper } = createWrapper();
      const { result } = renderHook(() => useMoveColumn("b1"), { wrapper });

      await act(() => result.current.mutateAsync({ id: "a", afterColumnId: "b" }));

      expect(commands.moveColumn).toHaveBeenCalledWith("a", "b");
      expect(columnIds(queryClient)).toBeUndefined();
    });
  });
});
