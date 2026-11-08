import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, ProjectDetails } from "@/bindings";
import {
  projectKeys,
  useArchiveProject,
  useCreateProject,
  useDeleteProject,
  useProject,
  useProjects,
  useRestoreProject,
  useUpdateProject,
} from "@/modules/projects/queries";

const commands = vi.hoisted(() => ({
  listProjects: vi.fn(),
  getProject: vi.fn(),
  createProject: vi.fn(),
  updateProject: vi.fn(),
  archiveProject: vi.fn(),
  restoreProject: vi.fn(),
  deleteProject: vi.fn(),
}));

vi.mock("@/bindings", () => ({ commands }));

function createProjectFixture(overrides: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "ORBIT",
    description: "",
    icon: null,
    color: null,
    status: "active",
    createdAt: "2026-11-08T10:00:00Z",
    updatedAt: "2026-11-08T10:00:00Z",
    archivedAt: null,
    ...overrides,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe("project queries", () => {
  beforeEach(() => {
    for (const command of Object.values(commands)) {
      command.mockReset();
    }
  });

  describe("useProjects", () => {
    it("loads the projects for the given filters", async () => {
      const project = createProjectFixture();
      commands.listProjects.mockResolvedValue({ status: "ok", data: [project] });
      const { wrapper } = createWrapper();

      const { result } = renderHook(() => useProjects({ scope: "active" }), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual([project]);
      expect(commands.listProjects).toHaveBeenCalledWith({ scope: "active" });
    });

    it("exposes the backend error", async () => {
      const payload = { code: "DATABASE", message: "a database operation failed" };
      commands.listProjects.mockResolvedValue({ status: "error", error: payload });
      const { wrapper } = createWrapper();

      const { result } = renderHook(() => useProjects({}), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toBe(payload);
    });

    it("keeps the previous list visible while new filters load", async () => {
      const first = createProjectFixture({ id: "a", name: "Alpha" });
      const second = createProjectFixture({ id: "b", name: "Beta" });
      commands.listProjects.mockImplementation(async (input: { search?: string | null }) => ({
        status: "ok",
        data: input.search === "beta" ? [second] : [first],
      }));
      const { wrapper } = createWrapper();

      const { result, rerender } = renderHook(
        ({ search }: { search: string | null }) => useProjects({ search }),
        { wrapper, initialProps: { search: null as string | null } },
      );
      await waitFor(() => expect(result.current.data).toEqual([first]));

      rerender({ search: "beta" });

      expect(result.current.data).toEqual([first]);
      await waitFor(() => expect(result.current.data).toEqual([second]));
    });

    it("uses a separate cache entry for each set of filters", () => {
      expect(projectKeys.list({ scope: "active" })).not.toEqual(
        projectKeys.list({ scope: "archived" }),
      );
    });
  });

  describe("useProject", () => {
    it("loads the project details", async () => {
      const details: ProjectDetails = {
        project: createProjectFixture(),
        boards: [],
        taskCount: 3,
        backlogTaskCount: 1,
      };
      commands.getProject.mockResolvedValue({ status: "ok", data: details });
      const { wrapper } = createWrapper();

      const { result } = renderHook(() => useProject("p1"), { wrapper });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data).toEqual(details);
      expect(commands.getProject).toHaveBeenCalledWith("p1");
    });

    it("exposes a not found error", async () => {
      const payload = { code: "NOT_FOUND", message: "project not found" };
      commands.getProject.mockResolvedValue({ status: "error", error: payload });
      const { wrapper } = createWrapper();

      const { result } = renderHook(() => useProject("missing"), { wrapper });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error).toBe(payload);
    });
  });

  describe("mutations", () => {
    it("refreshes the lists after creating a project", async () => {
      commands.listProjects.mockResolvedValue({ status: "ok", data: [] });
      commands.createProject.mockResolvedValue({ status: "ok", data: createProjectFixture() });
      const { wrapper } = createWrapper();
      const list = renderHook(() => useProjects({}), { wrapper });
      await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
      const create = renderHook(() => useCreateProject(), { wrapper });

      await act(() => create.result.current.mutateAsync({ name: "ORBIT" }));

      expect(commands.createProject).toHaveBeenCalledWith({ name: "ORBIT" });
      expect(commands.listProjects).toHaveBeenCalledTimes(2);
    });

    it("sends the id and the patch when updating", async () => {
      commands.updateProject.mockResolvedValue({ status: "ok", data: createProjectFixture() });
      const { wrapper } = createWrapper();
      const { result } = renderHook(() => useUpdateProject(), { wrapper });

      await act(() => result.current.mutateAsync({ id: "p1", input: { color: null } }));

      expect(commands.updateProject).toHaveBeenCalledWith("p1", { color: null });
    });

    it("refreshes the details of the open project after an update", async () => {
      commands.getProject.mockResolvedValue({
        status: "ok",
        data: { project: createProjectFixture(), boards: [], taskCount: 0, backlogTaskCount: 0 },
      });
      commands.updateProject.mockResolvedValue({ status: "ok", data: createProjectFixture() });
      const { wrapper } = createWrapper();
      const detail = renderHook(() => useProject("p1"), { wrapper });
      await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));
      const update = renderHook(() => useUpdateProject(), { wrapper });

      await act(() => update.result.current.mutateAsync({ id: "p1", input: { name: "New" } }));

      expect(commands.getProject).toHaveBeenCalledTimes(2);
    });

    it.each([
      ["archive", useArchiveProject, "archiveProject"],
      ["restore", useRestoreProject, "restoreProject"],
    ] as const)("%ss a project and refreshes the lists", async (_name, useHook, command) => {
      commands.listProjects.mockResolvedValue({ status: "ok", data: [] });
      commands[command].mockResolvedValue({ status: "ok", data: createProjectFixture() });
      const { wrapper } = createWrapper();
      const list = renderHook(() => useProjects({}), { wrapper });
      await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
      const mutation = renderHook(() => useHook(), { wrapper });

      await act(() => mutation.result.current.mutateAsync("p1"));

      expect(commands[command]).toHaveBeenCalledWith("p1");
      expect(commands.listProjects).toHaveBeenCalledTimes(2);
    });

    it("removes the details of a deleted project instead of refetching them", async () => {
      commands.getProject.mockResolvedValue({
        status: "ok",
        data: { project: createProjectFixture(), boards: [], taskCount: 0, backlogTaskCount: 0 },
      });
      commands.listProjects.mockResolvedValue({ status: "ok", data: [] });
      commands.deleteProject.mockResolvedValue({ status: "ok", data: null });
      const { queryClient, wrapper } = createWrapper();
      const detail = renderHook(() => useProject("p1"), { wrapper });
      await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));
      const remove = renderHook(() => useDeleteProject(), { wrapper });

      await act(() => remove.result.current.mutateAsync("p1"));

      expect(commands.deleteProject).toHaveBeenCalledWith("p1");
      expect(queryClient.getQueryData(projectKeys.detail("p1"))).toBeUndefined();
      expect(commands.getProject).toHaveBeenCalledTimes(1);
    });

    it("does not refresh anything when a mutation fails", async () => {
      const payload = { code: "VALIDATION", message: "project name cannot be empty" };
      commands.listProjects.mockResolvedValue({ status: "ok", data: [] });
      commands.createProject.mockResolvedValue({ status: "error", error: payload });
      const { wrapper } = createWrapper();
      const list = renderHook(() => useProjects({}), { wrapper });
      await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
      const create = renderHook(() => useCreateProject(), { wrapper });

      await expect(act(() => create.result.current.mutateAsync({ name: " " }))).rejects.toBe(
        payload,
      );

      expect(commands.listProjects).toHaveBeenCalledTimes(1);
    });
  });
});
