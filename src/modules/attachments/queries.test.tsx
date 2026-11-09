import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Attachment } from "@/bindings";
import { activityKeys } from "@/modules/activity/queries";
import {
  attachmentKeys,
  useAttachments,
  useImportAttachment,
  useOpenAttachment,
  useRemoveAttachment,
} from "@/modules/attachments/queries";

const commands = vi.hoisted(() => ({
  listAttachments: vi.fn(),
  importAttachment: vi.fn(),
  removeAttachment: vi.fn(),
  openAttachment: vi.fn(),
}));

vi.mock("@/bindings", () => ({ commands }));

const attachment: Attachment = {
  id: "f1",
  taskId: "t1",
  fileName: "spec.pdf",
  mimeType: "application/pdf",
  sizeBytes: 2048,
  createdAt: "2026-11-08T10:00:00Z",
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

describe("attachment queries", () => {
  beforeEach(() => {
    for (const command of Object.values(commands)) {
      command.mockReset();
      command.mockResolvedValue({ status: "ok", data: attachment });
    }
  });

  it("loads the attachments of a task", async () => {
    commands.listAttachments.mockResolvedValue({ status: "ok", data: [attachment] });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useAttachments("t1"), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([attachment]);
    expect(commands.listAttachments).toHaveBeenCalledWith("t1");
  });

  it("does not fetch while disabled", () => {
    const { wrapper } = createWrapper();

    renderHook(() => useAttachments("t1", false), { wrapper });

    expect(commands.listAttachments).not.toHaveBeenCalled();
  });

  it("keeps a separate cache entry per task", () => {
    expect(attachmentKeys.task("t1")).not.toEqual(attachmentKeys.task("t2"));
  });

  it("refreshes the list and the activity after importing", async () => {
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useImportAttachment("t1"), { wrapper });

    await act(() => result.current.mutateAsync({ taskId: "t1", sourcePath: "C:\\a.pdf" }));

    expect(commands.importAttachment).toHaveBeenCalledWith("t1", "C:\\a.pdf");
    expect(invalidatedKeys(invalidate)).toEqual(
      expect.arrayContaining([attachmentKeys.task("t1"), activityKeys.all]),
    );
  });

  it("refreshes them after removing", async () => {
    commands.removeAttachment.mockResolvedValue({ status: "ok", data: null });
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useRemoveAttachment("t1"), { wrapper });

    await act(() => result.current.mutateAsync("f1"));

    expect(commands.removeAttachment).toHaveBeenCalledWith("f1");
    expect(invalidatedKeys(invalidate)).toEqual(
      expect.arrayContaining([attachmentKeys.task("t1"), activityKeys.all]),
    );
  });

  it("opens an attachment without refreshing anything", async () => {
    commands.openAttachment.mockResolvedValue({ status: "ok", data: null });
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useOpenAttachment(), { wrapper });

    await act(() => result.current.mutateAsync("f1"));

    expect(commands.openAttachment).toHaveBeenCalledWith("f1");
    expect(invalidate).not.toHaveBeenCalled();
  });
});
