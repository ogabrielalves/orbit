import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NoteDetails } from "@/bindings";
import { folderKeys } from "@/modules/folders/queries";
import {
  noteKeys,
  useCreateNote,
  useNote,
  useSaveNote,
  useSetupVault,
  useVaultStatus,
  vaultKeys,
} from "@/modules/notes/queries";
import { settingsKeys } from "@/modules/settings/queries";

const commands = vi.hoisted(() => ({
  getVaultStatus: vi.fn(),
  setupVault: vi.fn(),
  getNote: vi.fn(),
  createNote: vi.fn(),
  saveNote: vi.fn(),
}));

vi.mock("@/bindings", () => ({ commands }));

const note: NoteDetails = {
  id: "n1",
  path: "Plan.md",
  title: "Plan",
  tags: [],
  createdAt: "2026-11-08T10:00:00Z",
  modifiedAt: "2026-11-08T10:00:00Z",
  content: "# Plan",
  hash: "h1",
};

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(queryClient, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, invalidate, wrapper };
}

describe("notes queries", () => {
  beforeEach(() => {
    for (const command of Object.values(commands)) {
      command.mockReset();
    }
  });

  it("reads the vault status", async () => {
    commands.getVaultStatus.mockResolvedValue({
      status: "ok",
      data: { path: null, isAccessible: false },
    });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useVaultStatus(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(vaultKeys.status).toEqual(["vault", "status"]);
  });

  it("refreshes status, settings, notes and folders after setting the vault up", async () => {
    commands.setupVault.mockResolvedValue({
      status: "ok",
      data: { path: "C:\\notes", wasCreated: false, noteCount: 1 },
    });
    const { invalidate, wrapper } = createWrapper();
    const { result } = renderHook(() => useSetupVault(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ path: "C:\\notes", create: false });
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: vaultKeys.status });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: settingsKeys.all });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: noteKeys.all });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: folderKeys.all });
  });

  it("loads one note by id", async () => {
    commands.getNote.mockResolvedValue({ status: "ok", data: note });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useNote("n1"), { wrapper });

    await waitFor(() => expect(result.current.data).toEqual(note));
    expect(commands.getNote).toHaveBeenCalledWith("n1");
  });

  it("does not load a note while disabled", () => {
    const { wrapper } = createWrapper();

    renderHook(() => useNote("n1", false), { wrapper });

    expect(commands.getNote).not.toHaveBeenCalled();
  });

  it("refreshes notes, folders after creating a note", async () => {
    commands.createNote.mockResolvedValue({ status: "ok", data: note });
    const { invalidate, wrapper } = createWrapper();
    const { result } = renderHook(() => useCreateNote(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ title: "Plan" });
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: noteKeys.all });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: folderKeys.all });
  });

  it("keeps the saved note in the cache without refetching it", async () => {
    const saved = { ...note, hash: "h2", content: "# Plan\n\nmore" };
    commands.saveNote.mockResolvedValue({ status: "ok", data: saved });
    const { queryClient, invalidate, wrapper } = createWrapper();
    const { result } = renderHook(() => useSaveNote(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: "n1",
        input: { content: saved.content, baseHash: "h1" },
      });
    });

    expect(queryClient.getQueryData(noteKeys.detail("n1"))).toEqual(saved);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: noteKeys.lists });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: noteKeys.all });
  });
});
