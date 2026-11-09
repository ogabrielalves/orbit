import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { boardKeys } from "@/modules/boards/queries";
import { dashboardKeys } from "@/modules/dashboard/queries";
import { projectKeys } from "@/modules/projects/queries";
import {
  taskKeys,
  useArchiveTask,
  useBoardTasks,
  useCreateTask,
  useDeleteTask,
  useRestoreTask,
  useSendTaskToBacklog,
  useSendTaskToBoard,
  useTask,
  useUpdateTask,
} from "@/modules/tasks/queries";
import { createTaskFixture } from "@/test/taskFixture";

const commands = vi.hoisted(() => ({
  listBoardTasks: vi.fn(),
  getTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  archiveTask: vi.fn(),
  restoreTask: vi.fn(),
  deleteTask: vi.fn(),
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
});
