import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardDetails, Task } from "@/bindings";
import { boardKeys } from "@/modules/boards/queries";
import { dashboardKeys } from "@/modules/dashboard/queries";
import { projectKeys } from "@/modules/projects/queries";
import {
  taskKeys,
  useArchiveTask,
  useBoardTasks,
  useCreateSubtask,
  useCreateTask,
  useDeleteTask,
  useDuplicateTask,
  useMoveSubtask,
  useMoveTask,
  useRestoreTask,
  useSendTaskToBacklog,
  useSendTaskToBoard,
  useSetSubtaskDone,
  useSubtasks,
  useTask,
  useUpdateTask,
} from "@/modules/tasks/queries";
import { createBoardDetailsFixture } from "@/test/boardFixture";
import { createTaskFixture } from "@/test/taskFixture";

const commands = vi.hoisted(() => ({
  listBoardTasks: vi.fn(),
  getTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  archiveTask: vi.fn(),
  restoreTask: vi.fn(),
  deleteTask: vi.fn(),
  duplicateTask: vi.fn(),
  moveTask: vi.fn(),
  listSubtasks: vi.fn(),
  createSubtask: vi.fn(),
  setSubtaskDone: vi.fn(),
  moveSubtask: vi.fn(),
  sendTaskToBoard: vi.fn(),
  sendTaskToBacklog: vi.fn(),
}));

vi.mock("@/bindings", () => ({ commands }));

const task = createTaskFixture();

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

function invalidatedKeys(invalidate: { mock: { calls: unknown[][] } }): unknown[] {
  return invalidate.mock.calls.map(([filter]) => (filter as { queryKey: unknown }).queryKey);
}

const everyKey = [taskKeys.all, boardKeys.all, projectKeys.all, dashboardKeys.all];

describe("task queries", () => {
  beforeEach(() => {
    for (const command of Object.values(commands)) {
      command.mockReset();
      command.mockResolvedValue({ status: "ok", data: task });
    }
  });

  describe("reading", () => {
    it("loads the tasks of a board", async () => {
      commands.listBoardTasks.mockResolvedValue({ status: "ok", data: [task] });
      const { wrapper } = createWrapper();

      const { result } = renderHook(() => useBoardTasks("b1"), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([task]);
      expect(commands.listBoardTasks).toHaveBeenCalledWith("b1");
    });

    it("does not fetch while disabled", () => {
      const { wrapper } = createWrapper();

      renderHook(() => useBoardTasks("b1", false), { wrapper });

      expect(commands.listBoardTasks).not.toHaveBeenCalled();
    });

    it("exposes the backend error", async () => {
      const payload = { code: "NOT_FOUND", message: "board not found" };
      commands.listBoardTasks.mockResolvedValue({ status: "error", error: payload });
      const { wrapper } = createWrapper();

      const { result } = renderHook(() => useBoardTasks("b1"), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toBe(payload);
    });

    it("loads one task", async () => {
      const { wrapper } = createWrapper();

      const { result } = renderHook(() => useTask("t1"), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(task);
    });

    it("keeps a separate cache entry per board and per task", () => {
      expect(taskKeys.board("b1")).not.toEqual(taskKeys.board("b2"));
      expect(taskKeys.detail("t1")).not.toEqual(taskKeys.detail("t2"));
    });
  });

  describe("writing", () => {
    async function expectRefresh(
      useHook: () => { mutateAsync: (variables: never) => Promise<unknown> },
      variables: unknown,
      command: keyof typeof commands,
    ) {
      const { queryClient, wrapper } = createWrapper();
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");
      const { result } = renderHook(useHook, { wrapper });

      await act(() => result.current.mutateAsync(variables as never));

      expect(commands[command]).toHaveBeenCalledTimes(1);
      expect(invalidatedKeys(invalidate)).toEqual(expect.arrayContaining(everyKey));
    }

    it("refreshes tasks, boards, projects and the dashboard after creating", async () => {
      await expectRefresh(useCreateTask, { projectId: "p1", title: "New" }, "createTask");
    });

    it("refreshes them after updating", async () => {
      await expectRefresh(useUpdateTask, { id: "t1", input: { title: "x" } }, "updateTask");
    });

    it("refreshes them after archiving and restoring", async () => {
      await expectRefresh(useArchiveTask, "t1", "archiveTask");
      await expectRefresh(useRestoreTask, "t1", "restoreTask");
    });

    it("refreshes them after deleting", async () => {
      await expectRefresh(useDeleteTask, "t1", "deleteTask");
    });

    it("refreshes them after duplicating", async () => {
      await expectRefresh(useDuplicateTask, { id: "t1", title: "Copy" }, "duplicateTask");
    });

    it("refreshes them after sending to a board or to the backlog", async () => {
      await expectRefresh(
        useSendTaskToBoard,
        { id: "t1", boardId: "b2", columnId: null },
        "sendTaskToBoard",
      );
      await expectRefresh(useSendTaskToBacklog, "t1", "sendTaskToBacklog");
    });

    it("does not refresh anything when the backend refuses", async () => {
      commands.createTask.mockResolvedValue({
        status: "error",
        error: { code: "VALIDATION", message: "x" },
      });
      const { queryClient, wrapper } = createWrapper();
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");
      const { result } = renderHook(() => useCreateTask(), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ projectId: "p1", title: "New" }).catch(() => undefined);
      });

      expect(invalidate).not.toHaveBeenCalled();
    });
  });

  describe("moving", () => {
    const first = createTaskFixture({ id: "t1", columnId: "c1", position: "a0" });
    const second = createTaskFixture({ id: "t2", columnId: "c1", position: "a1" });

    function seed(queryClient: QueryClient) {
      queryClient.setQueryData<Task[]>(taskKeys.board("b1"), [first, second]);
      queryClient.setQueryData<BoardDetails>(boardKeys.detail("b1"), createBoardDetailsFixture());
    }

    function ids(queryClient: QueryClient, columnId: string): string[] {
      const tasks = queryClient.getQueryData<Task[]>(taskKeys.board("b1")) ?? [];
      return tasks
        .filter((task) => task.columnId === columnId)
        .sort((a, b) => a.position.localeCompare(b.position))
        .map((task) => task.id);
    }

    it("moves the card in the cache and shifts the counters before the backend answers", async () => {
      commands.moveTask.mockReturnValue(new Promise(() => undefined));
      const { queryClient, wrapper } = createWrapper();
      seed(queryClient);
      const { result } = renderHook(() => useMoveTask("b1"), { wrapper });

      act(() => result.current.mutate({ id: "t1", columnId: "c2", afterTaskId: null }));

      await waitFor(() => expect(ids(queryClient, "c2")).toEqual(["t1"]));
      expect(ids(queryClient, "c1")).toEqual(["t2"]);
      const columns = queryClient.getQueryData<BoardDetails>(boardKeys.detail("b1"))?.columns;
      expect(columns?.map((column) => column.taskCount)).toEqual([1, 4, 0]);
      expect(commands.moveTask).toHaveBeenCalledWith("t1", "c2", null);
    });

    it("restores the tasks and the counters when the backend refuses", async () => {
      commands.moveTask.mockResolvedValue({ status: "error", error: { code: "X", message: "x" } });
      const { queryClient, wrapper } = createWrapper();
      seed(queryClient);
      const before = queryClient.getQueryData(boardKeys.detail("b1"));
      const { result } = renderHook(() => useMoveTask("b1"), { wrapper });

      await act(async () => {
        await result.current
          .mutateAsync({ id: "t1", columnId: "c2", afterTaskId: null })
          .catch(() => undefined);
      });

      expect(ids(queryClient, "c1")).toEqual(["t1", "t2"]);
      expect(ids(queryClient, "c2")).toEqual([]);
      expect(queryClient.getQueryData(boardKeys.detail("b1"))).toEqual(before);
    });

    it("refreshes tasks, boards, projects and the dashboard when it settles", async () => {
      const { queryClient, wrapper } = createWrapper();
      seed(queryClient);
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");
      const { result } = renderHook(() => useMoveTask("b1"), { wrapper });

      await act(() => result.current.mutateAsync({ id: "t1", columnId: "c2", afterTaskId: null }));

      expect(invalidatedKeys(invalidate)).toEqual(expect.arrayContaining(everyKey));
    });

    it("still calls the backend when the board is not in the cache", async () => {
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useMoveTask("b1"), { wrapper });

      await act(() => result.current.mutateAsync({ id: "t1", columnId: "c2", afterTaskId: "t9" }));

      expect(commands.moveTask).toHaveBeenCalledWith("t1", "c2", "t9");
    });
  });

  describe("subtasks", () => {
    const child = (id: string) => createTaskFixture({ id, parentTaskId: "t1", position: id });

    function ids(queryClient: QueryClient): string[] {
      const tasks = queryClient.getQueryData<Task[]>(taskKeys.subtasks("t1")) ?? [];
      return tasks.map((entry) => entry.id);
    }

    it("loads the subtasks of a task", async () => {
      commands.listSubtasks.mockResolvedValue({ status: "ok", data: [child("s1")] });
      const { wrapper } = createWrapper();

      const { result } = renderHook(() => useSubtasks("t1"), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([child("s1")]);
      expect(commands.listSubtasks).toHaveBeenCalledWith("t1");
    });

    it("creates a subtask under its parent and refreshes everything", async () => {
      const { queryClient, wrapper } = createWrapper();
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");
      const { result } = renderHook(() => useCreateSubtask("t1"), { wrapper });

      await act(() => result.current.mutateAsync("Child"));

      expect(commands.createSubtask).toHaveBeenCalledWith({ parentTaskId: "t1", title: "Child" });
      expect(invalidatedKeys(invalidate)).toEqual(expect.arrayContaining(everyKey));
    });

    it("completes and reopens a subtask", async () => {
      const { queryClient, wrapper } = createWrapper();
      const invalidate = vi.spyOn(queryClient, "invalidateQueries");
      const { result } = renderHook(() => useSetSubtaskDone(), { wrapper });

      await act(() => result.current.mutateAsync({ id: "s1", isDone: true }));

      expect(commands.setSubtaskDone).toHaveBeenCalledWith("s1", true);
      expect(invalidatedKeys(invalidate)).toEqual(expect.arrayContaining(everyKey));
    });

    it("reorders the cache before the backend answers", async () => {
      commands.moveSubtask.mockReturnValue(new Promise(() => undefined));
      const { queryClient, wrapper } = createWrapper();
      queryClient.setQueryData(taskKeys.subtasks("t1"), [child("a"), child("b"), child("c")]);
      const { result } = renderHook(() => useMoveSubtask("t1"), { wrapper });

      act(() => result.current.mutate({ id: "a", afterId: "c" }));

      await waitFor(() => expect(ids(queryClient)).toEqual(["b", "c", "a"]));
      expect(commands.moveSubtask).toHaveBeenCalledWith("a", "c");
    });

    it("puts the order back when the backend refuses", async () => {
      commands.moveSubtask.mockResolvedValue({
        status: "error",
        error: { code: "X", message: "x" },
      });
      const { queryClient, wrapper } = createWrapper();
      queryClient.setQueryData(taskKeys.subtasks("t1"), [child("a"), child("b"), child("c")]);
      const { result } = renderHook(() => useMoveSubtask("t1"), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ id: "a", afterId: "c" }).catch(() => undefined);
      });

      expect(ids(queryClient)).toEqual(["a", "b", "c"]);
    });
  });
});
