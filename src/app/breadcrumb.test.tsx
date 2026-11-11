import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands } from "@/bindings";
import { i18next } from "@/i18n";
import { createBoardDetailsFixture } from "@/test/boardFixture";
import { createProjectFixture } from "@/test/projectFixture";
import { renderApp } from "@/test/renderApp";

const getProject = vi.mocked(commands.getProject);
const getBoard = vi.mocked(commands.getBoard);
const listBoardTasks = vi.mocked(commands.listBoardTasks);

async function findBreadcrumb() {
  const nav = await screen.findByRole("navigation", { name: "Breadcrumb" });
  return within(nav);
}

describe("breadcrumb", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    getProject.mockReset();
    getBoard.mockReset();
    listBoardTasks.mockReset();
    getProject.mockResolvedValue({
      status: "ok",
      data: {
        project: createProjectFixture({ id: "p1", name: "Website 2.0" }),
        boards: [],
        taskCount: 0,
        backlogTaskCount: 0,
      },
    });
    getBoard.mockResolvedValue({ status: "ok", data: createBoardDetailsFixture() });
    listBoardTasks.mockResolvedValue({ status: "ok", data: [] });
  });

  it("names the project on its page, with the list as a link", async () => {
    renderApp("/projects/p1");

    const trail = await findBreadcrumb();

    expect(await trail.findByText("Website 2.0")).toHaveAttribute("aria-current", "page");
    expect(trail.getByRole("link", { name: "My projects" })).toHaveAttribute("href", "/projects");
  });

  it("shows only the list while the project loads", async () => {
    getProject.mockReturnValue(new Promise(() => undefined));
    renderApp("/projects/p1");

    expect(await (await findBreadcrumb()).findByText("My projects")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("names the project and the board on a board page", async () => {
    renderApp("/boards/b1");

    const trail = await findBreadcrumb();

    expect(await trail.findByText("Sprint 14")).toHaveAttribute("aria-current", "page");
    expect(await trail.findByRole("link", { name: "Website 2.0" })).toHaveAttribute(
      "href",
      "/projects/p1",
    );
    expect(trail.getByRole("link", { name: "My projects" })).toBeInTheDocument();
    expect(getProject).toHaveBeenCalledWith("p1");
  });

  it("goes to the project when its crumb is clicked", async () => {
    const router = renderApp("/boards/b1");

    await userEvent.click(
      await (await findBreadcrumb()).findByRole("link", { name: "Website 2.0" }),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe("/projects/p1"));
  });

  it("falls back to the list and the board when the project cannot be loaded", async () => {
    getProject.mockResolvedValue({ status: "error", error: { code: "NOT_FOUND", message: "x" } });
    renderApp("/boards/b1");

    const trail = await findBreadcrumb();

    expect(await trail.findByText("Sprint 14")).toBeInTheDocument();
    expect(trail.getByRole("link", { name: "My projects" })).toBeInTheDocument();
    expect(trail.queryByRole("link", { name: "Website 2.0" })).not.toBeInTheDocument();
  });

  it("keeps the page title on the other pages", async () => {
    renderApp("/backlog");

    expect(await (await findBreadcrumb()).findByText("Backlog")).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});
