import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { i18next } from "@/i18n";
import { renderApp } from "@/test/renderApp";

describe("ProjectsPage", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
  });

  it("shows the empty state without any fake project", async () => {
    renderApp("/projects");

    expect(await screen.findByRole("heading", { name: "No projects yet" })).toBeInTheDocument();
    expect(screen.getByText("Your projects will appear here.")).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
  });

  it("renders the page title and every filter control", async () => {
    renderApp("/projects");

    expect(
      await screen.findByRole("heading", { level: 1, name: "My projects" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search projects" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Which projects to show" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Filter by status" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Sort by" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "View mode" })).toBeInTheDocument();
  });

  it("starts with the default filters", async () => {
    renderApp("/projects");
    await screen.findByRole("heading", { name: "No projects yet" });

    expect(screen.getByRole("radio", { name: "All" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Grid view" })).toBeChecked();
    expect(screen.getByRole("combobox", { name: "Sort by" })).toHaveValue("updated");
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });

  it("reads the filters from the URL", async () => {
    renderApp("/projects?status=paused&view=list&sort=name&q=site");
    await screen.findByRole("heading", { name: "No projects yet" });

    expect(screen.getByRole("radio", { name: "Paused" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "List view" })).toBeChecked();
    expect(screen.getByRole("combobox", { name: "Sort by" })).toHaveValue("name");
    expect(screen.getByRole("searchbox")).toHaveValue("site");
  });

  it("ignores invalid values in the URL", async () => {
    renderApp("/projects?status=bogus&view=table&sort=random");
    await screen.findByRole("heading", { name: "No projects yet" });

    expect(screen.getByRole("radio", { name: "All" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Grid view" })).toBeChecked();
    expect(screen.getByRole("combobox", { name: "Sort by" })).toHaveValue("updated");
  });

  it("writes the status filter to the URL", async () => {
    const router = renderApp("/projects");
    await screen.findByRole("heading", { name: "No projects yet" });

    await userEvent.click(screen.getByRole("radio", { name: "Completed" }));

    expect(screen.getByRole("radio", { name: "Completed" })).toBeChecked();
    expect(router.state.location.search).toMatchObject({ status: "completed" });
  });

  it("writes the search text to the URL and clears it when emptied", async () => {
    const router = renderApp("/projects");
    await screen.findByRole("heading", { name: "No projects yet" });

    await userEvent.type(screen.getByRole("searchbox"), "app");
    expect(router.state.location.search).toMatchObject({ q: "app" });

    await userEvent.clear(screen.getByRole("searchbox"));
    expect(router.state.location.search).not.toHaveProperty("q");
  });

  it("writes the sort order and view mode to the URL", async () => {
    const router = renderApp("/projects");
    await screen.findByRole("heading", { name: "No projects yet" });

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Sort by" }), "created");
    await userEvent.click(screen.getByRole("radio", { name: "List view" }));

    expect(router.state.location.search).toMatchObject({ sort: "created", view: "list" });
  });

  it("switches to the archived empty state", async () => {
    const router = renderApp("/projects");
    await screen.findByRole("heading", { name: "No projects yet" });

    await userEvent.click(screen.getByRole("radio", { name: "Archived" }));

    expect(
      await screen.findByRole("heading", { name: "No archived projects" }),
    ).toBeInTheDocument();
    expect(router.state.location.search).toMatchObject({ scope: "archived" });
  });

  it("combines several filters without losing the previous ones", async () => {
    const router = renderApp("/projects");
    await screen.findByRole("heading", { name: "No projects yet" });

    await userEvent.click(screen.getByRole("radio", { name: "Paused" }));
    await userEvent.click(screen.getByRole("radio", { name: "Archived" }));

    expect(router.state.location.search).toMatchObject({ status: "paused", scope: "archived" });
  });

  it("follows the active language", async () => {
    renderApp("/projects");
    await screen.findByRole("heading", { name: "No projects yet" });

    await act(() => i18next.changeLanguage("pt-BR"));

    expect(
      await screen.findByRole("heading", { name: "Nenhum projeto ainda" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Pausados" })).toBeInTheDocument();
  });
});
