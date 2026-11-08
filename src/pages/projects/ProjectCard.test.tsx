import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { i18next } from "@/i18n";
import { ProjectCard } from "@/pages/projects/ProjectCard";
import { createProjectFixture } from "@/test/projectFixture";
import { renderWithRouter } from "@/test/renderWithRouter";

function renderCard(project = createProjectFixture()) {
  const handlers = {
    onEdit: vi.fn(),
    onArchive: vi.fn(),
    onRestore: vi.fn(),
    onDelete: vi.fn(),
  };
  renderWithRouter(<ProjectCard project={project} {...handlers} />);
  return handlers;
}

async function openMenu() {
  await userEvent.click(await screen.findByRole("button", { name: /Project actions/ }));
}

describe("ProjectCard", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-08T12:12:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("links the name to the project page", async () => {
    renderCard();

    const link = await screen.findByRole("link", { name: "Website 2.0" });

    expect(link).toHaveAttribute("href", "/projects/p1");
  });

  it("shows the description", async () => {
    renderCard();

    expect(await screen.findByText("Redesign of the company site.")).toBeInTheDocument();
  });

  it("shows a muted fallback when there is no description", async () => {
    renderCard(createProjectFixture({ description: "   " }));

    expect(await screen.findByText("No description")).toBeInTheDocument();
  });

  it.each([
    ["active", "Active", "text-success-fg"],
    ["paused", "Paused", "text-warning-fg"],
    ["completed", "Completed", "text-fg-secondary"],
  ] as const)("shows the %s status as %s", async (status, label, colorClass) => {
    renderCard(createProjectFixture({ status }));

    expect(await screen.findByText(label)).toHaveClass(colorClass);
  });

  it("shows the creation date and how long ago it was updated", async () => {
    renderCard();

    expect(await screen.findByText("Created Sep 2, 2026")).toBeInTheDocument();
    expect(screen.getByText("Updated 12 minutes ago")).toBeInTheDocument();
  });

  it("formats the dates in the active language", async () => {
    await i18next.changeLanguage("pt-BR");
    renderCard();

    expect(await screen.findByText("Criado em 2 de set. de 2026")).toBeInTheDocument();
    expect(screen.getByText("Atualizado há 12 minutos")).toBeInTheDocument();
  });

  it("paints the project tile with the project color", async () => {
    renderCard(createProjectFixture({ color: "ember" }));

    const tile = await screen.findByText("W");

    expect(tile.style.color).toBe("var(--color-project-ember)");
  });

  it("names the actions menu after the project", async () => {
    renderCard();

    expect(
      await screen.findByRole("button", { name: "Project actions: Website 2.0" }),
    ).toBeInTheDocument();
  });

  it("offers edit, archive and delete for an active project", async () => {
    renderCard();

    await openMenu();

    expect(await screen.findByRole("menuitem", { name: "Edit project" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Archive" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Delete…" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Restore" })).not.toBeInTheDocument();
  });

  it("offers restore instead of archive for an archived project", async () => {
    renderCard(createProjectFixture({ archivedAt: "2026-11-01T00:00:00Z" }));

    await openMenu();

    expect(await screen.findByRole("menuitem", { name: "Restore" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Archive" })).not.toBeInTheDocument();
  });

  it("calls onEdit with the project", async () => {
    const project = createProjectFixture();
    const handlers = renderCard(project);

    await openMenu();
    await userEvent.click(await screen.findByRole("menuitem", { name: "Edit project" }));

    expect(handlers.onEdit).toHaveBeenCalledWith(project);
  });

  it("calls onArchive with the project", async () => {
    const project = createProjectFixture();
    const handlers = renderCard(project);

    await openMenu();
    await userEvent.click(await screen.findByRole("menuitem", { name: "Archive" }));

    expect(handlers.onArchive).toHaveBeenCalledWith(project);
    expect(handlers.onDelete).not.toHaveBeenCalled();
  });

  it("calls onRestore with an archived project", async () => {
    const project = createProjectFixture({ archivedAt: "2026-11-01T00:00:00Z" });
    const handlers = renderCard(project);

    await openMenu();
    await userEvent.click(await screen.findByRole("menuitem", { name: "Restore" }));

    expect(handlers.onRestore).toHaveBeenCalledWith(project);
  });

  it("calls onDelete with the project", async () => {
    const project = createProjectFixture();
    const handlers = renderCard(project);

    await openMenu();
    await userEvent.click(await screen.findByRole("menuitem", { name: "Delete…" }));

    expect(handlers.onDelete).toHaveBeenCalledWith(project);
  });

  it("is a single article that contains its own actions", async () => {
    renderCard();

    const article = await screen.findByRole("article");

    expect(within(article).getByRole("link", { name: "Website 2.0" })).toBeInTheDocument();
    expect(within(article).getByRole("button", { name: /Project actions/ })).toBeInTheDocument();
  });
});
