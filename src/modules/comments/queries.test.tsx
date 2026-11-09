import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Comment } from "@/bindings";
import { activityKeys } from "@/modules/activity/queries";
import {
  commentKeys,
  useComments,
  useCreateComment,
  useDeleteComment,
  useUpdateComment,
} from "@/modules/comments/queries";

const commands = vi.hoisted(() => ({
  listComments: vi.fn(),
  createComment: vi.fn(),
  updateComment: vi.fn(),
  deleteComment: vi.fn(),
}));

vi.mock("@/bindings", () => ({ commands }));

const comment: Comment = {
  id: "m1",
  taskId: "t1",
  body: "Looks good",
  createdAt: "2026-11-08T10:00:00Z",
  updatedAt: "2026-11-08T10:00:00Z",
};

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

describe("comment queries", () => {
  beforeEach(() => {
    for (const command of Object.values(commands)) {
      command.mockReset();
      command.mockResolvedValue({ status: "ok", data: comment });
    }
  });

  it("loads the comments of a task", async () => {
    commands.listComments.mockResolvedValue({ status: "ok", data: [comment] });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useComments("t1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([comment]);
    expect(commands.listComments).toHaveBeenCalledWith("t1");
  });

  it("does not fetch while disabled", () => {
    const { wrapper } = createWrapper();

    renderHook(() => useComments("t1", false), { wrapper });

    expect(commands.listComments).not.toHaveBeenCalled();
  });

  it("keeps a separate cache entry per task", () => {
    expect(commentKeys.task("t1")).not.toEqual(commentKeys.task("t2"));
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
      expect(invalidatedKeys(invalidate)).toEqual(
        expect.arrayContaining([commentKeys.task("t1"), activityKeys.all]),
      );
    }

    it("sends the task id and refreshes comments and activity after creating", async () => {
      await expectRefresh(() => useCreateComment("t1"), "Looks good", "createComment");
      expect(commands.createComment).toHaveBeenCalledWith({ taskId: "t1", body: "Looks good" });
    });

    it("refreshes them after editing", async () => {
      await expectRefresh(
        () => useUpdateComment("t1"),
        { id: "m1", body: "Looks great" },
        "updateComment",
      );
      expect(commands.updateComment).toHaveBeenCalledWith("m1", "Looks great");
    });

    it("refreshes them after deleting", async () => {
      await expectRefresh(() => useDeleteComment("t1"), "m1", "deleteComment");
    });
  });
});
