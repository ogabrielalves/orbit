import type { Page } from "@playwright/test";
import { boardIds, boardSeed, onboardedSeed, projectFixture } from "../fixture/seeds";
import { expect, test } from "../harness/test";

const projectOnlySeed = {
  ...onboardedSeed,
  projects: [projectFixture({ id: boardIds.project, name: "Website 2.0" })],
};

const boardUrl = `/boards/${boardIds.board}`;

async function columnNames(page: Page): Promise<string[]> {
  const handles = page.getByRole("button", { name: /^Reorder column / });
  const labels = await handles.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("aria-label") ?? ""),
  );
  return labels.map((label) => label.replace("Reorder column ", ""));
}

async function expectColumns(page: Page, names: string[]) {
  await expect.poll(() => columnNames(page)).toEqual(names);
}

async function openColumnMenu(page: Page, column: string, item: string) {
  await page.getByRole("button", { name: `Actions for column ${column}` }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

test.describe("creating a board", () => {
  test.use({ seed: projectOnlySeed });

  test("starts with no boards and offers the first one", async ({ page }) => {
    await page.goto(`/projects/${boardIds.project}`);

    await expect(page.getByRole("heading", { name: "No boards yet" })).toBeVisible();
    await expect(page.getByRole("button", { name: "New board" })).toBeVisible();
  });

  test("creates a board from the Personal template and opens it", async ({ page, orbit }) => {
    await page.goto(`/projects/${boardIds.project}`);
    await page.getByRole("button", { name: "New board" }).click();
    const dialog = page.getByRole("dialog", { name: "New board" });
    await expect(dialog.getByRole("button", { name: "Create board" })).toBeDisabled();

    await dialog.getByLabel("Board name").fill("  Launch plan  ");
    await dialog.getByRole("radio", { name: /Personal/ }).check({ force: true });
    await dialog.getByRole("button", { name: "Create board" }).click();

    await expect(page.getByText("Board created")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Launch plan" })).toBeVisible();
    await expectColumns(page, ["To do", "In progress", "Done"]);
    await expect(page.getByText("3 columns · 0 tasks")).toBeVisible();

    const [created] = await orbit.calls("create_board");
    expect(created?.args).toMatchObject({
      input: { projectId: boardIds.project, name: "Launch plan" },
    });
  });

  test("creates a board with the Sprint template columns", async ({ page }) => {
    await page.goto(`/projects/${boardIds.project}`);
    await page.getByRole("button", { name: "New board" }).click();
    const dialog = page.getByRole("dialog", { name: "New board" });

    await dialog.getByLabel("Board name").fill("Sprint 12");
    await dialog.getByRole("radio", { name: /Sprint/ }).check({ force: true });
    await dialog.getByRole("button", { name: "Create board" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "Sprint 12" })).toBeVisible();
    await expectColumns(page, ["Backlog", "To do", "In progress", "In review", "Done"]);
  });

  test("creates a blank board and adds the first column", async ({ page }) => {
    await page.goto(`/projects/${boardIds.project}`);
    await page.getByRole("button", { name: "New board" }).click();
    const dialog = page.getByRole("dialog", { name: "New board" });
    await dialog.getByLabel("Board name").fill("Ideas");
    await dialog.getByRole("radio", { name: /Blank/ }).check({ force: true });
    await dialog.getByRole("button", { name: "Create board" }).click();

    await expect(page.getByRole("heading", { name: "This board has no columns" })).toBeVisible();

    await page.getByRole("button", { name: "New column" }).first().click();
    const columnDialog = page.getByRole("dialog", { name: "New column" });
    await columnDialog.getByLabel("Column name").fill("Someday");
    await columnDialog.getByRole("button", { name: "Create column" }).click();

    await expect(page.getByText("Column created")).toBeVisible();
    await expectColumns(page, ["Someday"]);
  });

  test("lists the new board on the project with its task count", async ({ page }) => {
    await page.goto(`/projects/${boardIds.project}`);
    await page.getByRole("button", { name: "New board" }).click();
    const dialog = page.getByRole("dialog", { name: "New board" });
    await dialog.getByLabel("Board name").fill("Roadmap");
    await dialog.getByRole("button", { name: "Create board" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Roadmap" })).toBeVisible();

    await page.getByRole("link", { name: "Back to project" }).click();

    const card = page.getByRole("link", { name: /Roadmap/ });
    await expect(card).toContainText("0 tasks");
    await expect(page.getByRole("heading", { name: "No boards yet" })).toHaveCount(0);
  });
});

test.describe("an existing board", () => {
  test.use({ seed: boardSeed });

  test("shows its columns with the task counts", async ({ page }) => {
    await page.goto(boardUrl);

    await expect(page.getByRole("heading", { level: 1, name: "Sprint 1" })).toBeVisible();
    await expectColumns(page, ["To Do", "In Progress", "Done"]);
    await expect(page.getByText("3 columns · 3 tasks")).toBeVisible();
    await expect(
      page.getByRole("list", { name: "Tasks in To Do" }).getByRole("listitem"),
    ).toHaveCount(2);
    await expect(
      page.getByRole("list", { name: "Tasks in In Progress" }).getByRole("listitem"),
    ).toHaveCount(1);
    await expect(page.getByText("No tasks")).toBeVisible();
  });

  test("opens from the project page", async ({ page }) => {
    await page.goto(`/projects/${boardIds.project}`);

    await page.getByRole("link", { name: /Sprint 1/ }).click();

    await expect(page).toHaveURL(new RegExp(`${boardUrl}$`));
    await expect(page.getByRole("heading", { level: 1, name: "Sprint 1" })).toBeVisible();
  });

  test("renames the board", async ({ page }) => {
    await page.goto(boardUrl);

    await page.getByRole("button", { name: "Board actions" }).click();
    await page.getByRole("menuitem", { name: "Rename board" }).click();
    const dialog = page.getByRole("dialog", { name: "Rename board" });
    await expect(dialog.getByLabel("Board name")).toHaveValue("Sprint 1");
    await dialog.getByLabel("Board name").fill("Sprint 2");
    await dialog.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Board renamed")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Sprint 2" })).toBeVisible();
  });

  test("adds a column and keeps it after a reload", async ({ page }) => {
    await page.goto(boardUrl);

    await page.getByRole("button", { name: "New column" }).click();
    const dialog = page.getByRole("dialog", { name: "New column" });
    await expect(dialog.getByRole("button", { name: "Create column" })).toBeDisabled();
    await dialog.getByLabel("Column name").fill("In review");
    await dialog.getByRole("button", { name: "Create column" }).click();

    await expect(page.getByText("Column created")).toBeVisible();
    await expectColumns(page, ["To Do", "In Progress", "Done", "In review"]);

    await page.reload();

    await expectColumns(page, ["To Do", "In Progress", "Done", "In review"]);
  });

  test("edits the name and type of a column", async ({ page, orbit }) => {
    await page.goto(boardUrl);

    await openColumnMenu(page, "In Progress", "Edit column");
    const dialog = page.getByRole("dialog", { name: "Edit column" });
    await expect(dialog.getByLabel("Column name")).toHaveValue("In Progress");
    await dialog.getByLabel("Column name").fill("Doing");
    await dialog.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Column updated")).toBeVisible();
    await expectColumns(page, ["To Do", "Doing", "Done"]);
    const [updated] = await orbit.calls("update_column");
    expect(updated?.args).toMatchObject({ id: "seed-c2", input: { name: "Doing" } });
  });

  test("moves a column to the left and to the right from its menu", async ({ page }) => {
    await page.goto(boardUrl);

    await openColumnMenu(page, "Done", "Move left");
    await expectColumns(page, ["To Do", "Done", "In Progress"]);

    await openColumnMenu(page, "To Do", "Move right");
    await expectColumns(page, ["Done", "To Do", "In Progress"]);

    await page.reload();
    await expectColumns(page, ["Done", "To Do", "In Progress"]);
  });

  test("disables moving the first column left and the last one right", async ({ page }) => {
    await page.goto(boardUrl);

    await page.getByRole("button", { name: "Actions for column To Do" }).click();
    await expect(page.getByRole("menuitem", { name: "Move left" })).toBeDisabled();
    await page.keyboard.press("Escape");

    await page.getByRole("button", { name: "Actions for column Done" }).click();
    await expect(page.getByRole("menuitem", { name: "Move right" })).toBeDisabled();
  });

  test("deletes an empty column after confirmation", async ({ page }) => {
    await page.goto(boardUrl);

    await openColumnMenu(page, "Done", "Delete column");
    const dialog = page.getByRole("alertdialog", { name: "Delete the column “Done”?" });
    await dialog.getByRole("button", { name: "Delete" }).click();

    await expect(page.getByText("Column deleted")).toBeVisible();
    await expectColumns(page, ["To Do", "In Progress"]);
  });

  test("refuses to delete a column that still has tasks", async ({ page, orbit }) => {
    await page.goto(boardUrl);

    await openColumnMenu(page, "To Do", "Delete column");

    const dialog = page.getByRole("alertdialog", { name: "“To Do” cannot be deleted" });
    await expect(dialog).toContainText("This column still has 2 tasks");
    expect(await orbit.calls("delete_column")).toHaveLength(0);
    await expect(dialog.getByRole("button", { name: "Delete" })).toBeDisabled();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expectColumns(page, ["To Do", "In Progress", "Done"]);
  });

  test("deletes the board and sends its tasks back to the backlog", async ({ page }) => {
    await page.goto(boardUrl);

    await page.getByRole("button", { name: "Board actions" }).click();
    await page.getByRole("menuitem", { name: "Delete board" }).click();
    await page
      .getByRole("alertdialog", { name: "Delete the board “Sprint 1”?" })
      .getByRole("button", { name: "Delete" })
      .click();

    await expect(page.getByText("Board deleted")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/projects/${boardIds.project}$`));
    await expect(page.getByRole("heading", { name: "No boards yet" })).toBeVisible();
    await expect(page.getByText("In the backlog")).toBeVisible();
  });

  test("reports an unknown board with a recoverable error", async ({ page }) => {
    await page.goto("/boards/missing");

    await expect(page.getByText("Could not load the board")).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });

  test("tells the user when a column move is refused and keeps the order", async ({
    page,
    orbit,
  }) => {
    await page.goto(boardUrl);
    await orbit.failNext("move_column", { code: "NOT_FOUND", message: "gone" });

    await openColumnMenu(page, "Done", "Move left");

    await expect(page.getByText("Not found.")).toBeVisible();
    await expectColumns(page, ["To Do", "In Progress", "Done"]);
  });
});
