import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands, type ProjectDetails } from "@/bindings";
import { i18next } from "@/i18n";
import { createProjectFixture } from "@/test/projectFixture";
import { renderApp } from "@/test/renderApp";

const getProject = vi.mocked(commands.getProject);
const getVaultStatus = vi.mocked(commands.getVaultStatus);
const listFolders = vi.mocked(commands.listFolders);
const listNotes = vi.mocked(commands.listNotes);

function details(archivedAt: string | null): ProjectDetails {
  return {
    project: createProjectFixture({ id: "p1", archivedAt }),
    boards: [],
    taskCount: 0,
    backlogTaskCount: 0,
  };
}

describe("?new=1 on the creation pages", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    getProject.mockReset();
    getVaultStatus.mockResolvedValue({
      status: "ok",
      data: { path: "C:\\notes", isAccessible: true },
    });
    listFolders.mockResolvedValue({ status: "ok", data: [] });
    listNotes.mockResolvedValue({ status: "ok", data: [] });
  });

  it("opens the new project modal on /projects and clears the param", async () => {
    const router = renderApp("/projects?new=1");

    expect(await screen.findByRole("dialog", { name: "New project" })).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("new"));
    expect(router.state.location.pathname).toBe("/projects");
  });

  it("keeps the other filters when it clears the param", async () => {
    const router = renderApp("/projects?new=1&status=paused");

    await screen.findByRole("dialog", { name: "New project" });
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("new"));
    expect(router.state.location.search).toMatchObject({ status: "paused" });
  });

  it("does not open the modal without the param", async () => {
    renderApp("/projects");

    await screen.findByRole("heading", { name: "No projects yet" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens the new board modal on a project and clears the param", async () => {
    getProject.mockResolvedValue({ status: "ok", data: details(null) });
    const router = renderApp("/projects/p1?new=1");

    expect(await screen.findByRole("dialog", { name: "New board" })).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("new"));
    expect(router.state.location.pathname).toBe("/projects/p1");
  });

  it("does not open the board modal on an archived project but still clears the param", async () => {
    getProject.mockResolvedValue({ status: "ok", data: details("2026-11-01T12:00:00Z") });
    const router = renderApp("/projects/p1?new=1");

    await screen.findByRole("heading", { level: 1, name: "Website 2.0" });
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("new"));
    expect(screen.queryByRole("dialog", { name: "New board" })).not.toBeInTheDocument();
  });

  it("opens the new note modal on /notes and clears the param", async () => {
    const router = renderApp("/notes?new=1");

    expect(await screen.findByRole("dialog", { name: "New note" })).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.search).not.toHaveProperty("new"));
    expect(router.state.location.pathname).toBe("/notes");
  });

  it("does not reopen the modal after it was closed", async () => {
    renderApp("/notes?new=1");
    await screen.findByRole("dialog", { name: "New note" });

    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
