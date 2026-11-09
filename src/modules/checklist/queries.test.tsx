import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChecklistItem } from "@/bindings";
import { activityKeys } from "@/modules/activity/queries";
import {
  checklistKeys,
  useChecklist,
  useCreateChecklistItem,
  useDeleteChecklistItem,
  useMoveChecklistItem,
  useUpdateChecklistItem,
} from "@/modules/checklist/queries";

const commands = vi.hoisted(() => ({
  listChecklistItems: vi.fn(),
  createChecklistItem: vi.fn(),
  updateChecklistItem: vi.fn(),
  moveChecklistItem: vi.fn(),
  deleteChecklistItem: vi.fn(),
}));

vi.mock("@/bindings", () => ({ commands }));

function item(id: string): ChecklistItem {
  return {
    id,
    taskId: "t1",
    text: id,
    isDone: false,
    position: id,
    createdAt: "2026-11-08T10:00:00Z",
    updatedAt: "2026-11-08T10:00:00Z",
  };
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

function ids(queryClient: QueryClient): string[] {
  return (queryClient.getQueryData<ChecklistItem[]>(checklistKeys.task("t1")) ?? []).map(
    (entry) => entry.id,
  );
}

function invalidatedKeys(invalidate: { mock: { calls: unknown[][] } }): unknown[] {
  return invalidate.mock.calls.map(([filter]) => (filter as { queryKey: unknown }).queryKey);
}

describe("checklist queries", () => {
  beforeEach(() => {
    for (const command of Object.values(commands)) {
      command.mockReset();
      command.mockResolvedValue({ status: "ok", data: item("a") });
    }
  });

  it("loads the checklist of a task", async () => {
    commands.listChecklistItems.mockResolvedValue({ status: "ok", data: [item("a")] });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useChecklist("t1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([item("a")]);
    expect(commands.listChecklistItems).toHaveBeenCalledWith("t1");
  });

  it("does not fetch while disabled", () => {
    const { wrapper } = createWrapper();

    renderHook(() => useChecklist("t1", false), { wrapper });

    expect(commands.listChecklistItems).not.toHaveBeenCalled();
  });

  it("keeps a separate cache entry per task", () => {
    expect(checklistKeys.task("t1")).not.toEqual(checklistKeys.task("t2"));
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
        expect.arrayContaining([checklistKeys.task("t1"), activityKeys.all]),
      );
    }

    it("refreshes the checklist and the activity after creating", async () => {
      await expectRefresh(() => useCreateChecklistItem("t1"), "Review", "createChecklistItem");
      expect(commands.createChecklistItem).toHaveBeenCalledWith({ taskId: "t1", text: "Review" });
    });

    it("refreshes them after updating", async () => {
      await expectRefresh(
        () => useUpdateChecklistItem("t1"),
        { id: "a", input: { isDone: true } },
        "updateChecklistItem",
      );
    });

    it("refreshes them after deleting", async () => {
      await expectRefresh(() => useDeleteChecklistItem("t1"), "a", "deleteChecklistItem");
    });
  });

  describe("moving", () => {
    it("reorders the cache before the backend answers", async () => {
      commands.moveChecklistItem.mockReturnValue(new Promise(() => undefined));
      const { queryClient, wrapper } = createWrapper();
      queryClient.setQueryData(checklistKeys.task("t1"), [item("a"), item("b"), item("c")]);
      const { result } = renderHook(() => useMoveChecklistItem("t1"), { wrapper });

      act(() => result.current.mutate({ id: "a", afterId: "c" }));

      await waitFor(() => expect(ids(queryClient)).toEqual(["b", "c", "a"]));
      expect(commands.moveChecklistItem).toHaveBeenCalledWith("a", "c");
    });

    it("puts the order back when the backend refuses", async () => {
      commands.moveChecklistItem.mockResolvedValue({
        status: "error",
        error: { code: "X", message: "x" },
      });
      const { queryClient, wrapper } = createWrapper();
      queryClient.setQueryData(checklistKeys.task("t1"), [item("a"), item("b"), item("c")]);
      const { result } = renderHook(() => useMoveChecklistItem("t1"), { wrapper });

      await act(async () => {
        await result.current.mutateAsync({ id: "a", afterId: "c" }).catch(() => undefined);
      });

      expect(ids(queryClient)).toEqual(["a", "b", "c"]);
    });
  });
});
