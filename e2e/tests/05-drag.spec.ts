import type { Locator, Page } from "@playwright/test";
import { boardIds, boardSeed } from "../fixture/seeds";
import { expect, test } from "../harness/test";

const board = `/boards/${boardIds.board}`;

type StoredTask = { id: string; columnId: string | null; completedAt: string | null };

function card(page: Page, column: string, title: string): Locator {
  return page.getByRole("list", { name: `Tasks in ${column}` }).locator("li", { hasText: title });
}

async function cardTitles(page: Page, column: string): Promise<string[]> {
  const list = page.getByRole("list", { name: `Tasks in ${column}` });
  return list
    .locator("li")
    .evaluateAll((nodes) => nodes.map((node) => node.querySelector("span")?.textContent ?? ""));
}

async function columnNames(page: Page): Promise<string[]> {
  const handles = page.getByRole("button", { name: /^Reorder column / });
  const labels = await handles.evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("aria-label") ?? ""),
  );
  return labels.map((label) => label.replace("Reorder column ", ""));
}

async function dragTo(
  page: Page,
  source: Locator,
  target: Locator,
  where: "top" | "bottom" | "center",
) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (from === null || to === null) {
    throw new Error("the drag source or target is not visible");
  }
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  const endX = to.x + to.width / 2;
  const offsets = { top: 4, center: to.height / 2, bottom: to.height - 4 };
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 12, startY + 12, { steps: 4 });
  await page.mouse.move(endX, to.y + offsets[where], { steps: 25 });
  await page.mouse.up();
}

async function storedTask(orbit: { storedState: () => Promise<unknown> }, id: string) {
  const state = (await orbit.storedState()) as { tasks: StoredTask[] };
  return state.tasks.find((task) => task.id === id);
}

const KEY_SETTLE_MS = 150;

async function step(page: Page, key: string) {
  await page.keyboard.press(key);
  await page.waitForTimeout(KEY_SETTLE_MS);
}

test.use({ seed: boardSeed });

test.describe("dragging cards with the mouse", () => {
  test("reorders a card inside its column and keeps the order after a reload", async ({
    page,
    orbit,
  }) => {
    await page.goto(board);
    await expect
      .poll(() => cardTitles(page, "To Do"))
      .toEqual(["Write the spec", "Design the logo"]);

    await dragTo(
      page,
      card(page, "To Do", "Design the logo"),
      card(page, "To Do", "Write the spec"),
      "top",
    );

    await expect
      .poll(() => cardTitles(page, "To Do"))
      .toEqual(["Design the logo", "Write the spec"]);
    const [move] = await orbit.calls("move_task");
    expect(move?.args).toEqual({ id: "seed-t2", columnId: "seed-c1", afterTaskId: null });

    await page.reload();

    await expect
      .poll(() => cardTitles(page, "To Do"))
      .toEqual(["Design the logo", "Write the spec"]);
  });

  test("moves a card to another column and updates both counters", async ({ page, orbit }) => {
    await page.goto(board);

    await dragTo(
      page,
      card(page, "To Do", "Write the spec"),
      card(page, "In Progress", "Review copy"),
      "bottom",
    );

    await expect
      .poll(() => cardTitles(page, "In Progress"))
      .toEqual(["Review copy", "Write the spec"]);
    await expect.poll(() => cardTitles(page, "To Do")).toEqual(["Design the logo"]);
    await expect(page.getByRole("button", { name: "Reorder column To Do" })).toContainText("1");
    await expect(page.getByRole("button", { name: "Reorder column In Progress" })).toContainText(
      "2",
    );
    const [move] = await orbit.calls("move_task");
    expect(move?.args).toEqual({ id: "seed-t1", columnId: "seed-c2", afterTaskId: "seed-t3" });

    await page.reload();

    await expect
      .poll(() => cardTitles(page, "In Progress"))
      .toEqual(["Review copy", "Write the spec"]);
  });

  test("puts a card at the top of another column", async ({ page, orbit }) => {
    await page.goto(board);

    await dragTo(
      page,
      card(page, "To Do", "Write the spec"),
      card(page, "In Progress", "Review copy"),
      "top",
    );

    await expect
      .poll(() => cardTitles(page, "In Progress"))
      .toEqual(["Write the spec", "Review copy"]);
    const [move] = await orbit.calls("move_task");
    expect(move?.args).toEqual({ id: "seed-t1", columnId: "seed-c2", afterTaskId: null });
  });

  test("drops a card into an empty Done column and completes it", async ({ page, orbit }) => {
    await page.goto(board);

    await dragTo(
      page,
      card(page, "In Progress", "Review copy"),
      page.getByText("No tasks"),
      "center",
    );

    await expect.poll(() => cardTitles(page, "Done")).toEqual(["Review copy"]);
    expect((await storedTask(orbit, "seed-t3"))?.completedAt).not.toBeNull();
  });

  test("reopens a card that leaves the Done column", async ({ page, orbit }) => {
    await page.goto(board);
    await dragTo(
      page,
      card(page, "In Progress", "Review copy"),
      page.getByText("No tasks"),
      "center",
    );
    await expect.poll(() => cardTitles(page, "Done")).toEqual(["Review copy"]);
    await expect.poll(async () => (await orbit.calls("move_task")).length).toBe(1);
    await expect
      .poll(async () => (await orbit.calls("list_board_tasks")).length)
      .toBeGreaterThan(1);

    await dragTo(
      page,
      card(page, "Done", "Review copy"),
      card(page, "To Do", "Write the spec"),
      "bottom",
    );

    await expect.poll(() => cardTitles(page, "Done")).toEqual([]);
    expect((await storedTask(orbit, "seed-t3"))?.completedAt).toBeNull();
  });

  test("rolls the card back and explains when the backend refuses the move", async ({
    page,
    orbit,
  }) => {
    await page.goto(board);
    await orbit.failNext("move_task", { code: "INVALID_MOVE", message: "no" });

    await dragTo(
      page,
      card(page, "To Do", "Write the spec"),
      card(page, "In Progress", "Review copy"),
      "bottom",
    );

    await expect(page.getByText("This move is not allowed.")).toBeVisible();
    await expect
      .poll(() => cardTitles(page, "To Do"))
      .toEqual(["Write the spec", "Design the logo"]);
    await expect.poll(() => cardTitles(page, "In Progress")).toEqual(["Review copy"]);
    expect((await storedTask(orbit, "seed-t1"))?.columnId).toBe("seed-c1");
  });

  test("a click without moving still opens the drawer and never moves the card", async ({
    page,
    orbit,
  }) => {
    await page.goto(board);

    await card(page, "To Do", "Write the spec").click();

    await expect(page).toHaveURL(/\?task=seed-t1$/);
    expect(await orbit.calls("move_task")).toHaveLength(0);
  });
});

test.describe("dragging cards with the keyboard", () => {
  test("picks a card up, moves it down and drops it", async ({ page, orbit }) => {
    await page.goto(board);
    const first = card(page, "To Do", "Write the spec");
    await expect(first).toBeVisible();

    await first.focus();
    await step(page, "Space");
    await step(page, "ArrowDown");
    await step(page, "Space");

    await expect
      .poll(() => cardTitles(page, "To Do"))
      .toEqual(["Design the logo", "Write the spec"]);
    const [move] = await orbit.calls("move_task");
    expect(move?.args).toEqual({ id: "seed-t1", columnId: "seed-c1", afterTaskId: "seed-t2" });

    await page.reload();

    await expect
      .poll(() => cardTitles(page, "To Do"))
      .toEqual(["Design the logo", "Write the spec"]);
  });

  test("moves a card to the next column with the right arrow", async ({ page }) => {
    await page.goto(board);
    const first = card(page, "To Do", "Write the spec");
    await expect(first).toBeVisible();
    const live = page.locator('[aria-live="assertive"]');

    await first.focus();
    await step(page, "Space");
    await step(page, "ArrowRight");
    await step(page, "ArrowRight");
    await expect(live).toContainText("Card Write the spec is over In Progress.");
    await step(page, "Space");

    await expect.poll(() => cardTitles(page, "To Do")).toEqual(["Design the logo"]);
    await expect
      .poll(async () => (await cardTitles(page, "In Progress")).sort())
      .toEqual(["Review copy", "Write the spec"]);
  });

  test("announces the drag to screen readers", async ({ page }) => {
    await page.goto(board);
    const first = card(page, "To Do", "Write the spec");
    await expect(first).toBeVisible();
    const live = page.locator('[aria-live="assertive"]');

    await first.focus();
    await step(page, "Space");

    await expect(live).toContainText("Card Write the spec is over To Do.");

    await step(page, "Space");

    await expect(live).toContainText("Card Write the spec dropped in To Do.");
  });

  test("cancels the move with Escape and leaves the card where it was", async ({ page, orbit }) => {
    await page.goto(board);
    const first = card(page, "To Do", "Write the spec");
    await expect(first).toBeVisible();

    await first.focus();
    await step(page, "Space");
    await step(page, "ArrowRight");
    await step(page, "Escape");

    await expect(page.locator('[aria-live="assertive"]')).toContainText(
      "Moving cancelled. Card Write the spec returned to its original place.",
    );
    await expect
      .poll(() => cardTitles(page, "To Do"))
      .toEqual(["Write the spec", "Design the logo"]);
    expect(await orbit.calls("move_task")).toHaveLength(0);
  });

  test("Enter on a focused card opens the drawer and keeps it open", async ({ page }) => {
    await page.goto(board);
    const first = card(page, "To Do", "Write the spec");
    await expect(first).toBeVisible();

    await first.focus();
    await page.keyboard.press("Enter");

    await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible();
    await expect(page).toHaveURL(/\?task=seed-t1$/);
    await page.waitForTimeout(500);
    await expect(page.getByRole("dialog", { name: "Task details" })).toBeVisible();
  });
});

test.describe("reordering columns", () => {
  test("drags a column with the mouse and keeps the order after a reload", async ({
    page,
    orbit,
  }) => {
    await page.goto(board);
    await expect.poll(() => columnNames(page)).toEqual(["To Do", "In Progress", "Done"]);

    await dragTo(
      page,
      page.getByRole("button", { name: "Reorder column Done" }),
      page.getByRole("button", { name: "Reorder column To Do" }),
      "center",
    );

    await expect.poll(() => columnNames(page)).toEqual(["Done", "To Do", "In Progress"]);
    const [move] = await orbit.calls("move_column");
    expect(move?.args).toEqual({ id: "seed-c3", afterColumnId: null });

    await page.reload();

    await expect.poll(() => columnNames(page)).toEqual(["Done", "To Do", "In Progress"]);
  });

  test("moves a column with the keyboard and announces it", async ({ page, orbit }) => {
    await page.goto(board);
    const handle = page.getByRole("button", { name: "Reorder column To Do" });
    await expect(handle).toBeVisible();

    await handle.focus();
    await step(page, "Space");
    await expect(page.locator('[aria-live="assertive"]')).toContainText("Column To Do");
    await step(page, "ArrowRight");
    await step(page, "ArrowRight");
    await expect(page.locator('[aria-live="assertive"]')).toContainText(
      "Column To Do moved to position 2 of 3.",
    );
    await step(page, "Space");

    await expect.poll(() => columnNames(page)).toEqual(["In Progress", "To Do", "Done"]);
    await expect(page.locator('[aria-live="assertive"]')).toContainText(
      "Column To Do dropped at position 2 of 3.",
    );
    const [move] = await orbit.calls("move_column");
    expect(move?.args).toEqual({ id: "seed-c1", afterColumnId: "seed-c2" });
  });

  test("restores the column order when the backend refuses the move", async ({ page, orbit }) => {
    await page.goto(board);
    await orbit.failNext("move_column", { code: "NOT_FOUND", message: "gone" });

    const handle = page.getByRole("button", { name: "Reorder column To Do" });
    await expect(handle).toBeVisible();
    await handle.focus();
    await step(page, "Space");
    await step(page, "ArrowRight");
    await step(page, "ArrowRight");
    await expect(page.locator('[aria-live="assertive"]')).toContainText(
      "Column To Do moved to position 2 of 3.",
    );
    await step(page, "Space");

    await expect(page.getByText("The item was not found. It may have been removed.")).toBeVisible();
    await expect.poll(() => columnNames(page)).toEqual(["To Do", "In Progress", "Done"]);
  });
});
