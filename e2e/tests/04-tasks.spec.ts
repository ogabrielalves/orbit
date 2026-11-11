import type { Locator, Page } from "@playwright/test";
import { boardIds, boardSeed, taskFixture } from "../fixture/seeds";
import type { Seed } from "../fixture/state";
import { expect, test } from "../harness/test";

const board = `/boards/${boardIds.board}`;
const drawerUrl = (taskId: string) => `${board}?task=${taskId}`;

const seededTags = [
  {
    id: "seed-g1",
    name: "Bug",
    color: "ember",
    createdAt: "2026-11-02T10:00:00.000Z",
    updatedAt: "2026-11-02T10:00:00.000Z",
  },
  {
    id: "seed-g2",
    name: "Design",
    color: "orchid",
    createdAt: "2026-11-02T10:00:00.000Z",
    updatedAt: "2026-11-02T10:00:00.000Z",
  },
];

const withTags: Seed = { ...boardSeed, tags: seededTags };

async function openDrawer(page: Page, taskId = "seed-t1"): Promise<Locator> {
  await page.goto(drawerUrl(taskId));
  const drawer = page.getByRole("dialog", { name: "Task details" });
  await expect(drawer.getByRole("textbox", { name: "Title" })).toBeVisible();
  return drawer;
}

async function cardTitles(page: Page, column: string): Promise<string[]> {
  const list = page.getByRole("list", { name: `Tasks in ${column}` });
  return list
    .locator("li")
    .evaluateAll((nodes) => nodes.map((node) => node.querySelector("span")?.textContent ?? ""));
}

test.describe("adding tasks to a column", () => {
  test.use({ seed: boardSeed });

  test("adds a card from the column quick add and keeps it after a reload", async ({
    page,
    orbit,
  }) => {
    await page.goto(board);

    await page.getByRole("button", { name: "Add a card to In Progress" }).click();
    const form = page.getByRole("form", { name: "New card in In Progress" });
    await form.getByRole("textbox", { name: "Card title" }).fill("  Ship the beta  ");
    await form.getByRole("button", { name: "Add card" }).click();

    await expect
      .poll(() => cardTitles(page, "In Progress"))
      .toEqual(["Review copy", "Ship the beta"]);
    await expect(page.getByText("3 columns · 4 tasks")).toBeVisible();
    const [created] = await orbit.calls("create_task");
    expect(created?.args).toMatchObject({
      input: { projectId: boardIds.project, title: "Ship the beta", columnId: "seed-c2" },
    });

    await page.reload();

    await expect
      .poll(() => cardTitles(page, "In Progress"))
      .toEqual(["Review copy", "Ship the beta"]);
  });

  test("does not add a card with a blank title", async ({ page, orbit }) => {
    await page.goto(board);
    await page.getByRole("button", { name: "Add a card to To Do" }).click();
    const form = page.getByRole("form", { name: "New card in To Do" });

    await form.getByRole("textbox", { name: "Card title" }).fill("   ");
    await form.getByRole("textbox", { name: "Card title" }).press("Enter");

    expect(await orbit.calls("create_task")).toHaveLength(0);
    await form.getByRole("button", { name: "Cancel" }).click();
    await expect(form).toBeHidden();
  });

  test("a card that lands in the Done column is already completed", async ({ page, orbit }) => {
    await page.goto(board);

    await page.getByRole("button", { name: "Add a card to Done" }).click();
    await page.getByRole("textbox", { name: "Card title" }).fill("Already shipped");
    await page.getByRole("button", { name: "Add card" }).click();

    await expect.poll(() => cardTitles(page, "Done")).toEqual(["Already shipped"]);
    const state = (await orbit.storedState()) as {
      tasks: { title: string; completedAt: string | null }[];
    };
    expect(
      state.tasks.find((task) => task.title === "Already shipped")?.completedAt,
    ).not.toBeNull();
  });

  test("explains a failure to create the card and keeps the form", async ({ page, orbit }) => {
    await page.goto(board);
    await orbit.failNext("create_task", { code: "VALIDATION", message: "bad" });

    await page.getByRole("button", { name: "Add a card to To Do" }).click();
    await page.getByRole("textbox", { name: "Card title" }).fill("Broken");
    await page.getByRole("button", { name: "Add card" }).click();

    await expect(page.getByText("The information provided is not valid.")).toBeVisible();
    await expect
      .poll(() => cardTitles(page, "To Do"))
      .toEqual(["Write the spec", "Design the logo"]);
  });
});

test.describe("the task drawer", () => {
  test.use({ seed: withTags });

  test("opens from a card, shows the task and closes with Escape", async ({ page }) => {
    await page.goto(board);

    await page.getByRole("list", { name: "Tasks in To Do" }).getByText("Write the spec").click();

    await expect(page).toHaveURL(/\?task=seed-t1$/);
    const drawer = page.getByRole("dialog", { name: "Task details" });
    await expect(drawer.getByRole("textbox", { name: "Title" })).toHaveValue("Write the spec");

    await page.keyboard.press("Escape");

    await expect(drawer).toBeHidden();
    await expect(page).toHaveURL(new RegExp(`${board}$`));
  });

  test("opens straight from a shared link", async ({ page }) => {
    const drawer = await openDrawer(page, "seed-t3");

    await expect(drawer.getByRole("textbox", { name: "Title" })).toHaveValue("Review copy");
  });

  test("edits the title, description, priority and due date", async ({ page, orbit }) => {
    const drawer = await openDrawer(page);

    await drawer.getByRole("textbox", { name: "Title" }).fill("Write the final spec");
    await drawer.getByRole("textbox", { name: "Description" }).fill("Cover the API and the UI");
    await drawer.getByLabel("Priority").selectOption("Urgent");
    await drawer.getByLabel("Due date").fill("2027-01-15");
    await drawer.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Task updated")).toBeVisible();
    const [saved] = await orbit.calls("update_task");
    expect(saved?.args).toMatchObject({
      id: "seed-t1",
      input: {
        title: "Write the final spec",
        description: "Cover the API and the UI",
        priority: "urgent",
        dueDate: "2027-01-15",
      },
    });
    await page.keyboard.press("Escape");
    const card = page
      .getByRole("list", { name: "Tasks in To Do" })
      .getByText("Write the final spec");
    await expect(card).toBeVisible();
    await expect(page.getByText("Urgent")).toBeVisible();
  });

  test("blocks saving a blank title and can discard the changes", async ({ page }) => {
    const drawer = await openDrawer(page);
    const title = drawer.getByRole("textbox", { name: "Title" });

    await title.fill("   ");
    await expect(drawer.getByRole("button", { name: "Save changes" })).toBeDisabled();

    await drawer.getByRole("button", { name: "Discard" }).click();

    await expect(title).toHaveValue("Write the spec");
  });

  test("records what changed in the history tab", async ({ page }) => {
    const drawer = await openDrawer(page);
    await drawer.getByLabel("Priority").selectOption("High");
    await drawer.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Task updated")).toBeVisible();

    await drawer.getByRole("radio", { name: "History" }).check({ force: true });

    const history = drawer.getByRole("list", { name: "History" });
    await expect(history.getByRole("listitem").first()).toContainText("Priority: medium → high");
  });

  test("duplicates the task with its details", async ({ page }) => {
    const drawer = await openDrawer(page);
    await drawer.getByRole("textbox", { name: "New checklist item" }).fill("Outline");
    await drawer.getByRole("textbox", { name: "New checklist item" }).press("Enter");
    await expect(drawer.getByRole("list", { name: "Checklist items" })).toContainText("Outline");

    await drawer.getByRole("button", { name: "Task actions" }).click();
    await page.getByRole("menuitem", { name: "Duplicate" }).click();

    await expect(page.getByText("Task duplicated")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect
      .poll(() => cardTitles(page, "To Do"))
      .toEqual(["Write the spec", "Write the spec (copy)", "Design the logo"]);
  });

  test("archives the task and takes it off the board", async ({ page }) => {
    const drawer = await openDrawer(page);

    await drawer.getByRole("button", { name: "Task actions" }).click();
    await page.getByRole("menuitem", { name: "Archive" }).click();

    await expect(page.getByText("Task archived")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect.poll(() => cardTitles(page, "To Do")).toEqual(["Design the logo"]);
  });

  test("deletes the task only after confirmation", async ({ page }) => {
    const drawer = await openDrawer(page);

    await drawer.getByRole("button", { name: "Task actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    const confirm = page.getByRole("alertdialog", { name: "Delete “Write the spec”?" });
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(confirm).toBeHidden();
    await expect(drawer.getByRole("textbox", { name: "Title" })).toHaveValue("Write the spec");

    await drawer.getByRole("button", { name: "Task actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page
      .getByRole("alertdialog", { name: "Delete “Write the spec”?" })
      .getByRole("button", { name: "Delete" })
      .click();

    await expect(page.getByText("Task deleted")).toBeVisible();
    await expect.poll(() => cardTitles(page, "To Do")).toEqual(["Design the logo"]);
  });

  test("reports an unknown task with a recoverable error", async ({ page }) => {
    await page.goto(drawerUrl("missing"));

    await expect(page.getByText("Could not load the task")).toBeVisible();
    await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  });
});

test.describe("a task with a due date", () => {
  test.use({
    seed: {
      ...withTags,
      tasks: [taskFixture("seed-t1", "Write the spec", "seed-c1", 0, { dueDate: "2027-02-01" })],
    },
  });

  test("shows the date and clears it", async ({ page, orbit }) => {
    const drawer = await openDrawer(page);
    await expect(drawer.getByLabel("Due date")).toHaveValue("2027-02-01");

    await drawer.getByRole("button", { name: "Clear date" }).click();
    await drawer.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByText("Task updated")).toBeVisible();
    const [saved] = await orbit.calls("update_task");
    expect(saved?.args).toMatchObject({ input: { dueDate: null } });
  });
});

test.describe("subtasks and checklist", () => {
  test.use({ seed: withTags });

  test("adds subtasks, completes one and shows the progress", async ({ page }) => {
    const drawer = await openDrawer(page);
    const field = drawer.getByRole("textbox", { name: "New subtask" });

    await field.fill("Draft");
    await field.press("Enter");
    await field.fill("Outline");
    await field.press("Enter");

    const list = drawer.getByRole("list", { name: "Subtask list" });
    await expect(list.getByRole("checkbox")).toHaveCount(2);
    await list.getByRole("checkbox", { name: "Draft" }).click();
    await expect(list.getByRole("checkbox", { name: "Draft" })).toBeChecked();
    await expect(
      drawer.getByRole("region", { name: "Subtasks" }).getByText("1/2 done"),
    ).toBeVisible();
  });

  test("renames and deletes a subtask from its menu", async ({ page }) => {
    const drawer = await openDrawer(page);
    const field = drawer.getByRole("textbox", { name: "New subtask" });
    await field.fill("Draft");
    await field.press("Enter");
    await field.fill("Outline");
    await field.press("Enter");

    await drawer.getByRole("button", { name: "Actions for subtask Draft" }).click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const rename = drawer.getByRole("textbox", { name: "Subtask title" });
    await rename.fill("First draft");
    await rename.press("Enter");

    const list = drawer.getByRole("list", { name: "Subtask list" });
    await expect(list.getByText("First draft")).toBeVisible();

    await drawer.getByRole("button", { name: "Actions for subtask Outline" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();

    await expect(list.getByText("Outline")).toHaveCount(0);
    await expect(list.getByText("First draft")).toBeVisible();
  });

  test("keeps the subtasks after a reload", async ({ page }) => {
    const drawer = await openDrawer(page);
    const field = drawer.getByRole("textbox", { name: "New subtask" });
    await field.fill("Draft");
    await field.press("Enter");
    await drawer.getByRole("checkbox", { name: "Draft" }).click();
    await expect(drawer.getByRole("checkbox", { name: "Draft" })).toBeChecked();

    await page.reload();

    const reopened = page.getByRole("dialog", { name: "Task details" });
    await expect(reopened.getByRole("checkbox", { name: "Draft" })).toBeChecked();
  });

  test("manages the checklist items", async ({ page }) => {
    const drawer = await openDrawer(page);
    const field = drawer.getByRole("textbox", { name: "New checklist item" });

    await field.fill("Check links");
    await field.press("Enter");
    await field.fill("Proofread");
    await field.press("Enter");
    const list = drawer.getByRole("list", { name: "Checklist items" });
    await expect(list.getByRole("checkbox")).toHaveCount(2);

    await list.getByRole("checkbox", { name: "Proofread" }).click();
    await expect(list.getByRole("checkbox", { name: "Proofread" })).toBeChecked();
    await expect(
      drawer.getByRole("region", { name: "Checklist" }).getByText("1/2 done"),
    ).toBeVisible();

    await drawer.getByRole("button", { name: "Actions for item Check links" }).click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    const rename = drawer.getByRole("textbox", { name: "Item text" });
    await rename.fill("Check all links");
    await rename.press("Enter");
    await expect(list.getByText("Check all links")).toBeVisible();

    await drawer.getByRole("button", { name: "Actions for item Proofread" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(list.getByText("Proofread")).toHaveCount(0);
  });

  test("ignores a blank item", async ({ page, orbit }) => {
    const drawer = await openDrawer(page);
    const field = drawer.getByRole("textbox", { name: "New checklist item" });

    await field.fill("   ");
    await field.press("Enter");

    expect(await orbit.calls("create_checklist_item")).toHaveLength(0);
  });
});

test.describe("tags and comments", () => {
  test.use({ seed: withTags });

  test("assigns an existing tag and removes it", async ({ page }) => {
    const drawer = await openDrawer(page);
    await expect(drawer.getByText("No tags yet")).toBeVisible();

    await drawer.getByRole("button", { name: "Add tag" }).click();
    await drawer.getByRole("button", { name: "Add tag Design" }).click();

    const assigned = drawer.getByRole("list", { name: "Tags of this task" });
    await expect(assigned.getByText("Design")).toBeVisible();

    await drawer.getByRole("button", { name: "Remove tag Design" }).click();

    await expect(drawer.getByText("No tags yet")).toBeVisible();
  });

  test("creates a new tag from the picker and assigns it", async ({ page, orbit }) => {
    const drawer = await openDrawer(page);

    await drawer.getByRole("button", { name: "Add tag" }).click();
    await drawer.getByRole("textbox", { name: "Find or create a tag" }).fill("Research");
    await drawer.getByRole("button", { name: "Create “Research”" }).click();

    await expect(
      drawer.getByRole("list", { name: "Tags of this task" }).getByText("Research"),
    ).toBeVisible();
    const [created] = await orbit.calls("create_tag");
    expect(created?.args).toMatchObject({ input: { name: "Research" } });
  });

  test("filters the available tags and never offers a duplicate name", async ({ page }) => {
    const drawer = await openDrawer(page);

    await drawer.getByRole("button", { name: "Add tag" }).click();
    await drawer.getByRole("textbox", { name: "Find or create a tag" }).fill("des");

    await expect(drawer.getByRole("button", { name: "Add tag Design" })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Add tag Bug" })).toHaveCount(0);

    await drawer.getByRole("textbox", { name: "Find or create a tag" }).fill("design");
    await expect(drawer.getByRole("button", { name: /^Create/ })).toHaveCount(0);
  });

  test("keeps the tags after a reload", async ({ page }) => {
    const drawer = await openDrawer(page);
    await drawer.getByRole("button", { name: "Add tag" }).click();
    await drawer.getByRole("button", { name: "Add tag Bug" }).click();

    await page.reload();

    const reopened = page.getByRole("dialog", { name: "Task details" });
    await expect(
      reopened.getByRole("list", { name: "Tags of this task" }).getByText("Bug"),
    ).toBeVisible();
  });

  test("adds, edits and deletes a comment", async ({ page }) => {
    const drawer = await openDrawer(page);
    await expect(drawer.getByText("No comments yet")).toBeVisible();
    const submit = drawer.getByRole("button", { name: "Comment", exact: true });
    await expect(submit).toBeDisabled();

    await drawer.getByRole("textbox", { name: "New comment" }).fill("  Looks good  ");
    await submit.click();

    const list = drawer.getByRole("list", { name: "Comments list" });
    await expect(list.getByText("Looks good")).toBeVisible();
    await expect(drawer.getByText("No comments yet")).toHaveCount(0);

    await drawer.getByRole("button", { name: "Comment actions" }).click();
    await page.getByRole("menuitem", { name: "Edit" }).click();
    const edit = drawer.getByRole("textbox", { name: "Edit comment" });
    await edit.fill("Looks great");
    await drawer.getByRole("button", { name: "Save", exact: true }).click();
    await expect(list.getByText("Looks great")).toBeVisible();

    await drawer.getByRole("button", { name: "Comment actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page
      .getByRole("alertdialog", { name: "Delete this comment?" })
      .getByRole("button", { name: "Delete" })
      .click();

    await expect(page.getByText("Comment deleted")).toBeVisible();
    await expect(drawer.getByText("No comments yet")).toBeVisible();
  });

  test("sends a comment with the keyboard shortcut", async ({ page }) => {
    const drawer = await openDrawer(page);

    await drawer.getByRole("textbox", { name: "New comment" }).fill("Via shortcut");
    await page.keyboard.press("Control+Enter");

    await expect(
      drawer.getByRole("list", { name: "Comments list" }).getByText("Via shortcut"),
    ).toBeVisible();
  });
});

test.describe("attachments", () => {
  test.use({ seed: withTags });

  test("starts with the drop hint and no files", async ({ page }) => {
    const drawer = await openDrawer(page);

    await expect(drawer.getByText("Drop files here to attach them")).toBeVisible();
    await expect(drawer.getByRole("list", { name: "Attached files" })).toHaveCount(0);
  });

  test("attaches files from the picker, opens one and removes another", async ({ page, orbit }) => {
    const drawer = await openDrawer(page);
    await orbit.setDialogResult(["C:\\docs\\spec.pdf", "C:\\docs\\logo.png"]);

    await drawer.getByRole("button", { name: "Attach" }).click();

    await expect(page.getByText("2 files attached")).toBeVisible();
    const list = drawer.getByRole("list", { name: "Attached files" });
    await expect(list.getByText("spec.pdf")).toBeVisible();
    await expect(list.getByText("logo.png")).toBeVisible();

    await drawer.getByRole("button", { name: "Open spec.pdf" }).click();
    await expect.poll(async () => (await orbit.calls("open_attachment")).length).toBe(1);

    await drawer.getByRole("button", { name: "Remove logo.png" }).click();
    await page
      .getByRole("alertdialog", { name: "Remove “logo.png”?" })
      .getByRole("button", { name: "Remove" })
      .click();

    await expect(page.getByText("Attachment removed")).toBeVisible();
    await expect(list.getByText("logo.png")).toHaveCount(0);
    await expect(list.getByText("spec.pdf")).toBeVisible();
  });

  test("keeps the file when the removal is cancelled", async ({ page, orbit }) => {
    const drawer = await openDrawer(page);
    await orbit.setDialogResult(["C:\\docs\\spec.pdf"]);
    await drawer.getByRole("button", { name: "Attach" }).click();
    await expect(page.getByText("1 file attached")).toBeVisible();

    await drawer.getByRole("button", { name: "Remove spec.pdf" }).click();
    await page
      .getByRole("alertdialog", { name: "Remove “spec.pdf”?" })
      .getByRole("button", { name: "Cancel" })
      .click();

    await expect(drawer.getByText("spec.pdf")).toBeVisible();
  });

  test("rejects a file type that is not allowed", async ({ page, orbit }) => {
    const drawer = await openDrawer(page);
    await orbit.setDialogResult(["C:\\tools\\setup.exe"]);

    await drawer.getByRole("button", { name: "Attach" }).click();

    await expect(page.getByText("The information provided is not valid.")).toBeVisible();
    await expect(drawer.getByRole("list", { name: "Attached files" })).toHaveCount(0);
  });

  test("does nothing when the picker is cancelled", async ({ page, orbit }) => {
    const drawer = await openDrawer(page);
    await orbit.setDialogResult(null);

    await drawer.getByRole("button", { name: "Attach" }).click();

    expect(await orbit.calls("import_attachment")).toHaveLength(0);
  });
});
