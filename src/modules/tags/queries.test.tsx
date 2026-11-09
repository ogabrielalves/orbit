import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tag } from "@/bindings";
import { activityKeys } from "@/modules/activity/queries";
import {
  tagKeys,
  useAssignTag,
  useCreateTag,
  useTags,
  useTaskTags,
  useUnassignTag,
} from "@/modules/tags/queries";

const commands = vi.hoisted(() => ({
  listTags: vi.fn(),
  listTaskTags: vi.fn(),
  createTag: vi.fn(),
  assignTag: vi.fn(),
  unassignTag: vi.fn(),
}));

vi.mock("@/bindings", () => ({ commands }));

const tag: Tag = {
  id: "g1",
  name: "Bug",
  color: null,
  createdAt: "2026-11-08T10:00:00Z",
  updatedAt: "2026-11-08T10:00:00Z",
  taskCount: 0,
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

describe("tag queries", () => {
  beforeEach(() => {
    for (const command of Object.values(commands)) {
      command.mockReset();
    }
    commands.listTags.mockResolvedValue({ status: "ok", data: [tag] });
    commands.listTaskTags.mockResolvedValue({ status: "ok", data: [tag] });
    commands.createTag.mockResolvedValue({ status: "ok", data: tag });
    commands.assignTag.mockResolvedValue({ status: "ok", data: null });
    commands.unassignTag.mockResolvedValue({ status: "ok", data: null });
  });

  it("loads every tag", async () => {
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useTags(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([tag]);
  });

  it("loads the tags of a task and skips the fetch while disabled", async () => {
    const { wrapper } = createWrapper();

    const enabled = renderHook(() => useTaskTags("t1"), { wrapper });
    renderHook(() => useTaskTags("t2", false), { wrapper });

    await waitFor(() => expect(enabled.result.current.isSuccess).toBe(true));
    expect(commands.listTaskTags).toHaveBeenCalledTimes(1);
    expect(commands.listTaskTags).toHaveBeenCalledWith("t1");
  });

  it("keeps a separate cache entry per task", () => {
    expect(tagKeys.task("t1")).not.toEqual(tagKeys.task("t2"));
  });

  it("refreshes the tag list after creating a tag", async () => {
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useCreateTag(), { wrapper });

    await act(() => result.current.mutateAsync({ name: "Bug", color: "ember" }));

    expect(commands.createTag).toHaveBeenCalledWith({ name: "Bug", color: "ember" });
    expect(invalidatedKeys(invalidate)).toEqual([tagKeys.list]);
  });

  it("refreshes the task tags, the list counters and the activity after assigning", async () => {
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useAssignTag(), { wrapper });

    await act(() => result.current.mutateAsync({ taskId: "t1", tagId: "g1" }));

    expect(commands.assignTag).toHaveBeenCalledWith("t1", "g1");
    expect(invalidatedKeys(invalidate)).toEqual(
      expect.arrayContaining([tagKeys.task("t1"), tagKeys.list, activityKeys.all]),
    );
  });

  it("refreshes the same things after unassigning", async () => {
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useUnassignTag(), { wrapper });

    await act(() => result.current.mutateAsync({ taskId: "t1", tagId: "g1" }));

    expect(commands.unassignTag).toHaveBeenCalledWith("t1", "g1");
    expect(invalidatedKeys(invalidate)).toEqual(
      expect.arrayContaining([tagKeys.task("t1"), tagKeys.list, activityKeys.all]),
    );
  });

  it("does not refresh anything when the backend refuses", async () => {
    commands.assignTag.mockResolvedValue({ status: "error", error: { code: "X", message: "x" } });
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useAssignTag(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ taskId: "t1", tagId: "g1" }).catch(() => undefined);
    });

    expect(invalidate).not.toHaveBeenCalled();
  });
});
