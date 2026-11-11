import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useExportDatabase, useImportDatabase } from "@/modules/backup/queries";

const { exportDatabase, importDatabase } = vi.hoisted(() => ({
  exportDatabase: vi.fn(),
  importDatabase: vi.fn(),
}));

vi.mock("@/bindings", () => ({ commands: { exportDatabase, importDatabase } }));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

const report = {
  backupSchemaVersion: 1,
  currentSchemaVersion: 1,
  wasUpgraded: false,
  safetyBackupPath: null,
};

describe("backup queries", () => {
  beforeEach(() => {
    exportDatabase.mockReset();
    importDatabase.mockReset();
  });

  it("exports the database and returns the written file", async () => {
    const file = { path: "D:\\backup.db", sizeBytes: 10 };
    exportDatabase.mockResolvedValue({ status: "ok", data: file });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useExportDatabase(), { wrapper });
    result.current.mutate({ destinationPath: "D:\\backup.db", overwrite: true });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(exportDatabase).toHaveBeenCalledWith({
      destinationPath: "D:\\backup.db",
      overwrite: true,
    });
    expect(result.current.data).toEqual(file);
  });

  it("exposes the backend error when the export fails", async () => {
    const payload = { code: "IO", message: "denied" };
    exportDatabase.mockResolvedValue({ status: "error", error: payload });
    const { wrapper } = createWrapper();

    const { result } = renderHook(() => useExportDatabase(), { wrapper });
    result.current.mutate({ destinationPath: "D:\\backup.db" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(payload);
  });

  it("invalidates every query after an import", async () => {
    importDatabase.mockResolvedValue({ status: "ok", data: report });
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useImportDatabase(), { wrapper });
    result.current.mutate({ sourcePath: "D:\\backup.db" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(importDatabase).toHaveBeenCalledWith({ sourcePath: "D:\\backup.db" });
    expect(invalidate).toHaveBeenCalledWith();
  });

  it("does not invalidate anything when the import fails", async () => {
    importDatabase.mockResolvedValue({
      status: "error",
      error: { code: "VALIDATION", message: "x" },
    });
    const { queryClient, wrapper } = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useImportDatabase(), { wrapper });
    result.current.mutate({ sourcePath: "D:\\bad.db" });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(invalidate).not.toHaveBeenCalled();
  });
});
