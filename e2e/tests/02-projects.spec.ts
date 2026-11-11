import type { Page } from "@playwright/test";
import { onboardedSeed, projectFixture } from "../fixture/seeds";
import { expect, test } from "../harness/test";

test.use({ seed: onboardedSeed });

async function createProject(page: Page, name: string, description?: string) {
  await page.getByRole("button", { name: "New project" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New project" });
  await dialog.getByLabel("Project name").fill(name);
  if (description !== undefined) {
    await dialog.getByLabel("Description").fill(description);
  }
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(dialog).toBeHidden();
}

function card(page: Page, name: string) {
  return page.getByRole("article").filter({ has: page.getByRole("link", { name, exact: true }) });
}

async function openCardMenu(page: Page, name: string, item: string) {
  await page.getByRole("button", { name: `Project actions: ${name}` }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

test.describe("projects", () => {
  test("starts with an empty state that invites the first project", async ({ page }) => {
    await page.goto("/projects");

    await expect(page.getByRole("heading", { name: "No projects yet" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create project" })).toBeVisible();
  });

  test("creates a project from the empty state and lists it", async ({ page }) => {
    await page.goto("/projects");

    await page.getByRole("button", { name: "Create project" }).click();
    const dialog = page.getByRole("dialog", { name: "New project" });
    await expect(dialog.getByRole("button", { name: "Create project" })).toBeDisabled();
    await dialog.getByLabel("Project name").fill("  Website 2.0  ");
    await dialog.getByLabel("Description").fill("Marketing site");
    await dialog.getByTitle("Lagoon").click();
    await expect(dialog.getByRole("radio", { name: "Lagoon" })).toBeChecked();
    await dialog.getByRole("button", { name: "Create project" }).click();

    await expect(page.getByText("Project created")).toBeVisible();
    const created = card(page, "Website 2.0");
    await expect(created).toBeVisible();
    await expect(created.getByText("Marketing site")).toBeVisible();
    await expect(created.getByText("Active", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "No projects yet" })).toHaveCount(0);
  });

  test("blocks a blank name and keeps the form open", async ({ page }) => {
    await page.goto("/projects");
    await page.getByRole("button", { name: "New project" }).first().click();
    const dialog = page.getByRole("dialog", { name: "New project" });

    await dialog.getByLabel("Project name").fill("    ");

    await expect(dialog.getByRole("button", { name: "Create project" })).toBeDisabled();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });

  test("keeps the projects after a reload", async ({ page }) => {
    await page.goto("/projects");
    await createProject(page, "Fintech");

    await page.reload();

    await expect(card(page, "Fintech")).toBeVisible();
  });

  test("shows the newest project first and the dashboard reflects it", async ({ page }) => {
    await page.goto("/projects");
    await createProject(page, "First");
    await createProject(page, "Second");

    const names = await page.getByRole("article").getByRole("link").allTextContents();
    expect(names).toEqual(["Second", "First"]);

    await page.goto("/");
    const links = page
      .getByRole("list")
      .filter({ has: page.getByRole("link", { name: /^Second/ }) })
      .getByRole("link");
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toContainText("Second");
    await expect(links.nth(1)).toContainText("First");
  });

  test("edits the name, description and status", async ({ page }) => {
    await page.goto("/projects");
    await createProject(page, "Draft");

    await openCardMenu(page, "Draft", "Edit project");
    const dialog = page.getByRole("dialog", { name: "Edit project" });
    await expect(dialog.getByLabel("Project name")).toHaveValue("Draft");
    await dialog.getByLabel("Project name").fill("Launch");
    await dialog.getByLabel("Status").selectOption("Paused");
    await dialog.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Project updated")).toBeVisible();
    const edited = card(page, "Launch");
    await expect(edited).toBeVisible();
    await expect(edited.getByText("Paused", { exact: true })).toBeVisible();
    await expect(card(page, "Draft")).toHaveCount(0);
  });

  test("archives a project, finds it under Archived and restores it", async ({ page }) => {
    await page.goto("/projects");
    await createProject(page, "Old idea");

    await openCardMenu(page, "Old idea", "Archive");
    const confirm = page.getByRole("alertdialog", { name: "Archive “Old idea”?" });
    await confirm.getByRole("button", { name: "Archive" }).click();

    await expect(page.getByText("Project archived")).toBeVisible();
    await expect(card(page, "Old idea")).toHaveCount(0);

    await page.getByRole("radio", { name: "Archived" }).check({ force: true });
    await expect(card(page, "Old idea")).toBeVisible();

    await openCardMenu(page, "Old idea", "Restore");
    await page
      .getByRole("alertdialog", { name: "Restore “Old idea”?" })
      .getByRole("button", { name: "Restore" })
      .click();

    await expect(page.getByText("Project restored")).toBeVisible();
    await expect(page.getByRole("heading", { name: "No archived projects" })).toBeVisible();
  });

  test("deletes a project only after confirmation", async ({ page }) => {
    await page.goto("/projects");
    await createProject(page, "Temporary");

    await openCardMenu(page, "Temporary", "Delete…");
    const confirm = page.getByRole("alertdialog", { name: "Delete “Temporary”?" });
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(card(page, "Temporary")).toBeVisible();

    await openCardMenu(page, "Temporary", "Delete…");
    const deleteDialog = page.getByRole("alertdialog", { name: "Delete “Temporary”?" });
    await expect(deleteDialog.getByRole("button", { name: "Delete" })).toBeDisabled();
    await deleteDialog
      .getByRole("textbox", { name: "Type Temporary to confirm" })
      .fill("Temporary");
    await deleteDialog.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByText("Project deleted")).toBeVisible();
    await expect(card(page, "Temporary")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "No projects yet" })).toBeVisible();
  });

  test("searches by name and clears the filter", async ({ page }) => {
    await page.goto("/projects");
    await createProject(page, "Alpha site");
    await createProject(page, "Beta app");

    await page.getByRole("searchbox", { name: "Search projects" }).fill("beta");
    await expect(card(page, "Beta app")).toBeVisible();
    await expect(card(page, "Alpha site")).toHaveCount(0);

    await page.getByRole("searchbox", { name: "Search projects" }).fill("zzz");
    await expect(page.getByRole("heading", { name: "No projects found" })).toBeVisible();

    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(card(page, "Alpha site")).toBeVisible();
    await expect(card(page, "Beta app")).toBeVisible();
  });

  test("opens the project and shows its empty board list", async ({ page }) => {
    await page.goto("/projects");
    await createProject(page, "Roadmap", "Q1 plan");

    await card(page, "Roadmap").getByRole("link", { name: "Roadmap" }).click();

    await expect(page).toHaveURL(/\/projects\/p\d+$/);
    await expect(page.getByRole("heading", { level: 1, name: "Roadmap" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "No boards yet" })).toBeVisible();

    await page.getByRole("link", { name: "Back to projects" }).click();
    await expect(page).toHaveURL(/\/projects$/);
  });

  test("absorbs a single transient failure with the automatic retry", async ({ page, orbit }) => {
    await page.goto("/projects");
    await expect(page.getByRole("heading", { name: "No projects yet" })).toBeVisible();
    await orbit.failNext("list_projects", { code: "DATABASE", message: "locked" });

    await page.reload();

    await expect(page.getByRole("heading", { name: "No projects yet" })).toBeVisible();
    await expect(page.getByText("Could not load the projects")).toHaveCount(0);
  });

  test("explains a failure to load the projects and recovers on retry", async ({ page, orbit }) => {
    await page.goto("/projects");
    await expect(page.getByRole("heading", { name: "No projects yet" })).toBeVisible();
    await orbit.failNext("list_projects", { code: "DATABASE", message: "locked" });
    await orbit.failNext("list_projects", { code: "DATABASE", message: "locked" });

    await page.reload();

    await expect(page.getByText("Could not load the projects")).toBeVisible();

    await page.getByRole("button", { name: "Try again" }).click();

    await expect(page.getByRole("heading", { name: "No projects yet" })).toBeVisible();
  });
});

test.describe("projects that already exist", () => {
  test.use({
    seed: {
      ...onboardedSeed,
      projects: [
        projectFixture(),
        projectFixture({
          id: "seed-p2",
          name: "Shelved",
          archivedAt: "2026-11-02T10:00:00.000Z",
          updatedAt: "2026-11-02T10:00:00.000Z",
        }),
      ],
    },
  });

  test("separates active from archived projects", async ({ page }) => {
    await page.goto("/projects");

    await expect(card(page, "Website 2.0")).toBeVisible();
    await expect(card(page, "Shelved")).toHaveCount(0);

    await page.getByRole("radio", { name: "Archived" }).check({ force: true });

    await expect(card(page, "Shelved")).toBeVisible();
    await expect(card(page, "Website 2.0")).toHaveCount(0);
  });

  test("reports an unknown project id with a recoverable error", async ({ page }) => {
    await page.goto("/projects/does-not-exist");

    await expect(page.getByText("Could not load the project")).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });
});
