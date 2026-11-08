import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, ProjectDetails } from "@/bindings";
import {
  archiveProject,
  createProject,
  deleteProject,
  fetchProject,
  fetchProjects,
  restoreProject,
  updateProject,
} from "@/modules/projects/api";

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

const project: Project = {
  id: "p1",
  name: "ORBIT",
  description: "",
  icon: null,
  color: null,
  status: "active",
  createdAt: "2026-11-08T10:00:00Z",
  updatedAt: "2026-11-08T10:00:00Z",
  archivedAt: null,
};

const details: ProjectDetails = { project, boards: [], taskCount: 0, backlogTaskCount: 0 };
const payload = { code: "NOT_FOUND", message: "project not found" };

describe("projects api", () => {
  beforeEach(() => {
    for (const command of Object.values(commands)) {
      command.mockReset();
    }
  });

  it("lists projects with the given filters", async () => {
    commands.listProjects.mockResolvedValue({ status: "ok", data: [project] });
    const input = { scope: "archived", status: "paused", search: "app" } as const;

    await expect(fetchProjects(input)).resolves.toEqual([project]);

    expect(commands.listProjects).toHaveBeenCalledWith(input);
  });

  it("loads the details of one project", async () => {
    commands.getProject.mockResolvedValue({ status: "ok", data: details });

    await expect(fetchProject("p1")).resolves.toEqual(details);

    expect(commands.getProject).toHaveBeenCalledWith("p1");
  });

  it("creates a project", async () => {
    commands.createProject.mockResolvedValue({ status: "ok", data: project });

    await expect(createProject({ name: "ORBIT", color: "orbit" })).resolves.toEqual(project);

    expect(commands.createProject).toHaveBeenCalledWith({ name: "ORBIT", color: "orbit" });
  });

  it("updates a project by id, sending null to clear a field", async () => {
    commands.updateProject.mockResolvedValue({ status: "ok", data: project });

    await updateProject("p1", { color: null, status: "paused" });

    expect(commands.updateProject).toHaveBeenCalledWith("p1", { color: null, status: "paused" });
  });

  it("archives and restores a project", async () => {
    commands.archiveProject.mockResolvedValue({ status: "ok", data: project });
    commands.restoreProject.mockResolvedValue({ status: "ok", data: project });

    await archiveProject("p1");
    await restoreProject("p1");

    expect(commands.archiveProject).toHaveBeenCalledWith("p1");
    expect(commands.restoreProject).toHaveBeenCalledWith("p1");
  });

  it("deletes a project", async () => {
    commands.deleteProject.mockResolvedValue({ status: "ok", data: null });

    await expect(deleteProject("p1")).resolves.toBeNull();

    expect(commands.deleteProject).toHaveBeenCalledWith("p1");
  });

  it.each([
    ["list", () => fetchProjects({}), "listProjects"],
    ["get", () => fetchProject("p1"), "getProject"],
    ["create", () => createProject({ name: "x" }), "createProject"],
    ["update", () => updateProject("p1", {}), "updateProject"],
    ["archive", () => archiveProject("p1"), "archiveProject"],
    ["restore", () => restoreProject("p1"), "restoreProject"],
    ["delete", () => deleteProject("p1"), "deleteProject"],
  ] as const)(
    "rejects with the backend error payload when %s fails",
    async (_name, run, command) => {
      commands[command].mockResolvedValue({ status: "error", error: payload });

      await expect(run()).rejects.toBe(payload);
    },
  );
});
