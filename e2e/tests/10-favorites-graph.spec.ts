import type { Locator, Page } from "@playwright/test";
import { favoritesSeed, graphSeed } from "../fixture/favoriteSeeds";
import { emptyVaultSeed } from "../fixture/vaultSeeds";
import { expect, test } from "../harness/test";

type StoredFavorite = { entityType: string; entityId: string };
type FavoritesState = { favorites: StoredFavorite[] };

async function storedFavorites(orbit: { storedState: () => Promise<unknown> }): Promise<string[]> {
  const state = (await orbit.storedState()) as FavoritesState;
  return state.favorites.map((favorite) => `${favorite.entityType}:${favorite.entityId}`);
}

function sidebar(page: Page): Locator {
  return page.getByRole("navigation", { name: "Main navigation" });
}

function favoriteRows(page: Page): Locator {
  return page.getByRole("main").getByRole("listitem");
}

async function rowTitles(page: Page): Promise<string[]> {
  return favoriteRows(page).evaluateAll((rows) =>
    rows.map((row) => row.querySelector("a")?.textContent ?? ""),
  );
}

async function dragHandle(page: Page, source: Locator, target: Locator) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (from === null || to === null) {
    throw new Error("the drag source or target is not visible");
  }
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 4, startY + 8, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + 4, { steps: 20 });
  await page.mouse.up();
}

async function moveThesisUpWithTheKeyboard(page: Page) {
  await page.getByRole("button", { name: "Reorder Thesis" }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByText(/^Thesis (picked up|is over Thesis).$/)).toBeAttached();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByText("Thesis is over Website 2.0.")).toBeAttached();
  await page.keyboard.press("Space");
}

test.describe("starring things", () => {
  test.use({ seed: favoritesSeed });

  test("starts with nothing starred", async ({ page }) => {
    await page.goto("/favorites");

    await expect(page.getByRole("heading", { name: "No favorites yet" })).toBeVisible();
    await expect(sidebar(page).getByRole("link", { name: "Website 2.0" })).toHaveCount(0);
  });

  test("stars a project from its page and shows it in the sidebar", async ({ page, orbit }) => {
    await page.goto("/projects/seed-p1");
    const star = page.getByRole("button", { name: "Add to favorites: Website 2.0" });
    await expect(star).toHaveAttribute("aria-pressed", "false");

    await star.click();

    await expect(
      page.getByRole("button", { name: "Remove from favorites: Website 2.0" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(sidebar(page).getByRole("link", { name: "Website 2.0" })).toHaveAttribute(
      "href",
      "/projects/seed-p1",
    );
    expect(await storedFavorites(orbit)).toEqual(["project:seed-p1"]);
    const [toggled] = await orbit.calls("toggle_favorite");
    expect(toggled?.args).toEqual({ reference: { entityType: "project", entityId: "seed-p1" } });
  });

  test("unstars it again and takes it out of the sidebar", async ({ page, orbit }) => {
    await page.goto("/projects/seed-p1");
    await page.getByRole("button", { name: "Add to favorites: Website 2.0" }).click();
    await expect(sidebar(page).getByRole("link", { name: "Website 2.0" })).toBeVisible();

    await page.getByRole("button", { name: "Remove from favorites: Website 2.0" }).click();

    await expect(
      page.getByRole("button", { name: "Add to favorites: Website 2.0" }),
    ).toHaveAttribute("aria-pressed", "false");
    await expect(sidebar(page).getByRole("link", { name: "Website 2.0" })).toHaveCount(0);
    expect(await storedFavorites(orbit)).toEqual([]);
  });

  test("stars a project from its card in the list", async ({ page, orbit }) => {
    await page.goto("/projects");

    await page.getByRole("button", { name: "Add to favorites: Thesis" }).click();

    await expect(page.getByRole("button", { name: "Remove from favorites: Thesis" })).toBeVisible();
    expect(await storedFavorites(orbit)).toEqual(["project:seed-p2"]);
  });

  test("stars a note from the editor", async ({ page, orbit }) => {
    await page.goto("/notes/seed-alpha");

    await page.getByRole("button", { name: "Add to favorites: Alpha" }).click();

    await expect(sidebar(page).getByRole("link", { name: "Alpha" })).toHaveAttribute(
      "href",
      "/notes/seed-alpha",
    );
    expect(await storedFavorites(orbit)).toEqual(["note:seed-alpha"]);
  });

  test("stars a board and a task, and the sidebar links reach them", async ({ page, orbit }) => {
    await page.goto("/boards/seed-b1?task=seed-t1");
    const drawer = page.getByRole("dialog", { name: "Task details" });
    await drawer.getByRole("button", { name: "Add to favorites: Write the spec" }).click();
    await expect(
      drawer.getByRole("button", { name: "Remove from favorites: Write the spec" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Add to favorites: Sprint 1" }).click();

    await expect(sidebar(page).getByRole("link", { name: "Write the spec" })).toHaveAttribute(
      "href",
      "/boards/seed-b1?task=seed-t1",
    );
    await expect(sidebar(page).getByRole("link", { name: "Sprint 1" })).toHaveAttribute(
      "href",
      "/boards/seed-b1",
    );
    expect(await storedFavorites(orbit)).toEqual(["task:seed-t1", "board:seed-b1"]);
  });

  test("stars a folder from its menu and opens it from the sidebar", async ({ page, orbit }) => {
    await page.goto("/notes");
    await page
      .getByRole("navigation", { name: "Folders" })
      .getByRole("button", { name: "Actions for Ideas" })
      .click();

    await page.getByRole("menuitem", { name: "Add to favorites" }).click();

    await sidebar(page).getByRole("link", { name: "Ideas" }).click();
    await expect(page).toHaveURL(/\/notes\?folder=Ideas$/);
    expect(await storedFavorites(orbit)).toEqual(["folder:Ideas"]);
    await page
      .getByRole("navigation", { name: "Folders" })
      .getByRole("button", { name: "Actions for Ideas" })
      .click();
    await expect(page.getByRole("menuitem", { name: "Remove from favorites" })).toBeVisible();
  });

  test("keeps the favorites after a reload", async ({ page }) => {
    await page.goto("/projects/seed-p1");
    await page.getByRole("button", { name: "Add to favorites: Website 2.0" }).click();
    await expect(sidebar(page).getByRole("link", { name: "Website 2.0" })).toBeVisible();

    await page.reload();

    await expect(
      page.getByRole("button", { name: "Remove from favorites: Website 2.0" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(sidebar(page).getByRole("link", { name: "Website 2.0" })).toBeVisible();
  });

  test("leaves the sidebar empty of favorites after the last one is removed", async ({ page }) => {
    await page.goto("/notes/seed-alpha");
    await page.getByRole("button", { name: "Add to favorites: Alpha" }).click();
    await expect(sidebar(page).getByRole("link", { name: "Alpha" })).toBeVisible();

    await page.getByRole("button", { name: "Remove from favorites: Alpha" }).click();

    await expect(sidebar(page).getByRole("link", { name: "Alpha" })).toHaveCount(0);
  });
});

test.describe("the favorites page", () => {
  test.use({ seed: favoritesSeed });

  async function starEverything(page: Page) {
    await page.goto("/projects/seed-p1");
    await page.getByRole("button", { name: "Add to favorites: Website 2.0" }).click();
    await page.goto("/notes/seed-alpha");
    await page.getByRole("button", { name: "Add to favorites: Alpha" }).click();
    await page.goto("/boards/seed-b1");
    await page.getByRole("button", { name: "Add to favorites: Sprint 1" }).click();
    await page.goto("/notes");
    await page
      .getByRole("navigation", { name: "Folders" })
      .getByRole("button", { name: "Actions for Work" })
      .click();
    await page.getByRole("menuitem", { name: "Add to favorites" }).click();
    await expect(
      page.getByRole("navigation", { name: "Main navigation" }).getByRole("link", { name: "Work" }),
    ).toBeVisible();
  }

  test("groups the favorites by type in a fixed order with a count", async ({ page }) => {
    await starEverything(page);

    await page.goto("/favorites");

    await expect(page.getByText("4 favorites")).toBeVisible();
    const headings = await page
      .getByRole("main")
      .getByRole("heading", { level: 2 })
      .allTextContents();
    expect(headings).toEqual(["Projects", "Boards", "Notes", "Folders"]);
  });

  test("shows where each favorite lives and links to it", async ({ page }) => {
    await starEverything(page);

    await page.goto("/favorites");

    const main = page.getByRole("main");
    await expect(main.getByRole("link", { name: "Sprint 1" })).toHaveAttribute(
      "href",
      "/boards/seed-b1",
    );
    await expect(main.getByRole("link", { name: "Alpha" })).toHaveAttribute(
      "href",
      "/notes/seed-alpha",
    );
    await expect(main.getByRole("link", { name: "Work" })).toHaveAttribute(
      "href",
      "/notes?folder=Work",
    );
    await expect(main.getByRole("listitem").filter({ hasText: "Sprint 1" })).toContainText(
      "Website 2.0",
    );
  });

  test("opens a favorite from the page", async ({ page }) => {
    await starEverything(page);
    await page.goto("/favorites");

    await page.getByRole("main").getByRole("link", { name: "Alpha" }).click();

    await expect(page).toHaveURL(/\/notes\/seed-alpha/);
    await expect(page.getByRole("heading", { level: 2, name: "Alpha" })).toBeVisible();
  });

  test("removes a favorite with its star", async ({ page, orbit }) => {
    await starEverything(page);
    await page.goto("/favorites");

    await page.getByRole("button", { name: "Remove from favorites: Alpha" }).click();

    await expect(page.getByRole("main").getByRole("link", { name: "Alpha" })).toHaveCount(0);
    await expect(page.getByText("3 favorites")).toBeVisible();
    expect(await storedFavorites(orbit)).not.toContain("note:seed-alpha");
  });

  test("flags a favorite whose project was archived and hides it from the sidebar", async ({
    page,
  }) => {
    await page.goto("/projects/seed-p1");
    await page.getByRole("button", { name: "Add to favorites: Website 2.0" }).click();
    await expect(sidebar(page).getByRole("link", { name: "Website 2.0" })).toBeVisible();
    await page.getByRole("button", { name: "Project actions" }).click();
    await page.getByRole("menuitem", { name: "Archive" }).click();
    await page
      .getByRole("alertdialog", { name: "Archive “Website 2.0”?" })
      .getByRole("button", { name: "Archive" })
      .click();
    await expect(page.getByText("Project archived")).toBeVisible();

    await page.goto("/favorites");

    await expect(favoriteRows(page).filter({ hasText: "Website 2.0" })).toContainText("Archived");
    await expect(sidebar(page).getByRole("link", { name: "Website 2.0" })).toHaveCount(0);
  });

  test("drops a favorite whose note was deleted", async ({ page }) => {
    await page.goto("/notes/seed-alpha");
    await page.getByRole("button", { name: "Add to favorites: Alpha" }).click();
    await page.getByRole("button", { name: "Note actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Note deleted")).toBeVisible();

    await page.goto("/favorites");

    await expect(page.getByRole("heading", { name: "No favorites yet" })).toBeVisible();
  });
});

test.describe("reordering favorites", () => {
  test.use({ seed: favoritesSeed });

  async function starBothProjects(page: Page) {
    await page.goto("/projects");
    await page.getByRole("button", { name: "Add to favorites: Website 2.0" }).click();
    await expect(
      page.getByRole("button", { name: "Remove from favorites: Website 2.0" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Add to favorites: Thesis" }).click();
    await expect(page.getByRole("button", { name: "Remove from favorites: Thesis" })).toBeVisible();
  }

  test("lists the favorites in the order they were starred", async ({ page }) => {
    await starBothProjects(page);

    await page.goto("/favorites");

    await expect.poll(() => rowTitles(page)).toEqual(["Website 2.0", "Thesis"]);
  });

  test("moves a favorite above another one by dragging its handle", async ({ page, orbit }) => {
    await starBothProjects(page);
    await page.goto("/favorites");
    await expect.poll(() => rowTitles(page)).toEqual(["Website 2.0", "Thesis"]);

    await dragHandle(
      page,
      page.getByRole("button", { name: "Reorder Thesis" }),
      favoriteRows(page).filter({ hasText: "Website 2.0" }),
    );

    await expect.poll(() => rowTitles(page)).toEqual(["Thesis", "Website 2.0"]);
    const [moved] = await orbit.calls("move_favorite");
    expect(moved?.args).toEqual({
      reference: { entityType: "project", entityId: "seed-p2" },
      afterReference: null,
    });
    expect(await storedFavorites(orbit)).toEqual(["project:seed-p2", "project:seed-p1"]);
  });

  test("moves a favorite with the keyboard", async ({ page, orbit }) => {
    await starBothProjects(page);
    await page.goto("/favorites");
    await expect.poll(() => rowTitles(page)).toEqual(["Website 2.0", "Thesis"]);

    await moveThesisUpWithTheKeyboard(page);

    await expect.poll(() => rowTitles(page)).toEqual(["Thesis", "Website 2.0"]);
    expect(await storedFavorites(orbit)).toEqual(["project:seed-p2", "project:seed-p1"]);
  });

  test("keeps the new order after a reload and in the sidebar", async ({ page }) => {
    await starBothProjects(page);
    await page.goto("/favorites");
    await moveThesisUpWithTheKeyboard(page);
    await expect.poll(() => rowTitles(page)).toEqual(["Thesis", "Website 2.0"]);

    await page.reload();

    await expect.poll(() => rowTitles(page)).toEqual(["Thesis", "Website 2.0"]);
    const links = await sidebar(page)
      .getByRole("link")
      .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ""));
    expect(links.indexOf("Thesis")).toBeLessThan(links.indexOf("Website 2.0"));
  });
});

test.describe("the notes graph", () => {
  test.use({ seed: graphSeed });

  function graph(page: Page): Locator {
    return page.getByRole("region", { name: "Notes graph" });
  }

  async function viewport(page: Page): Promise<{ x: number; y: number; scale: number }> {
    const transform = await graph(page)
      .locator("svg")
      .locator(":scope > g")
      .getAttribute("transform");
    const match = /translate\(([-\d.e]+) ([-\d.e]+)\) scale\(([-\d.e]+)\)/.exec(transform ?? "");
    if (match === null) {
      throw new Error(`unexpected transform: ${transform}`);
    }
    return { x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]) };
  }

  async function nodePosition(node: Locator): Promise<string> {
    return (await node.locator("xpath=..").getAttribute("transform")) ?? "";
  }

  test("opens with every note as a link and the count of notes and links", async ({ page }) => {
    await page.goto("/graph");

    await expect(page.getByText("4 notes · 3 links")).toBeVisible();
    for (const title of ["Alpha", "Beta", "Gamma", "Delta"]) {
      await expect(graph(page).getByRole("link", { name: title })).toBeVisible();
    }
  });

  test("adds the links without a note when asked", async ({ page, orbit }) => {
    await page.goto("/graph");
    await expect(page.getByText("4 notes · 3 links")).toBeVisible();

    await page.getByRole("checkbox", { name: "Show links without a note" }).check();

    await expect(page.getByText("5 notes · 4 links")).toBeVisible();
    await expect(graph(page).getByRole("link")).toHaveCount(4);
    const calls = await orbit.calls("get_graph");
    expect(calls.at(-1)?.args).toEqual({ input: { includeUnresolved: true } });
  });

  test("opens the note when its node is clicked", async ({ page }) => {
    await page.goto("/graph");

    await graph(page).getByRole("link", { name: "Beta" }).click();

    await expect(page).toHaveURL(/\/notes\/seed-beta/);
    await expect(page.getByRole("heading", { level: 2, name: "Beta" })).toBeVisible();
  });

  test("opens the note from the keyboard", async ({ page }) => {
    await page.goto("/graph");
    const gamma = graph(page).getByRole("link", { name: "Gamma" });

    await gamma.focus();
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/notes\/seed-gamma/);
  });

  test("dims what is not a neighbour of the hovered node", async ({ page }) => {
    await page.goto("/graph");
    const alpha = graph(page).getByRole("link", { name: "Alpha" });

    await alpha.hover();

    await expect(graph(page).getByRole("link", { name: "Gamma" }).locator("xpath=..")).toHaveCSS(
      "opacity",
      "0.25",
    );
    await expect(graph(page).getByRole("link", { name: "Beta" }).locator("xpath=..")).toHaveCSS(
      "opacity",
      "1",
    );
  });

  test("zooms with the buttons and fits back", async ({ page }) => {
    await page.goto("/graph");
    await expect(graph(page).getByRole("link", { name: "Alpha" })).toBeVisible();
    const initial = await viewport(page);

    await graph(page).getByRole("button", { name: "Zoom in" }).click();
    expect((await viewport(page)).scale).toBeGreaterThan(initial.scale);

    await graph(page).getByRole("button", { name: "Zoom out" }).click();
    await graph(page).getByRole("button", { name: "Zoom out" }).click();
    expect((await viewport(page)).scale).toBeLessThan(initial.scale);

    await graph(page).getByRole("button", { name: "Fit to screen" }).click();
    const fitted = await viewport(page);
    expect(fitted.scale).toBeCloseTo(initial.scale, 3);
  });

  test("zooms with the mouse wheel", async ({ page }) => {
    await page.goto("/graph");
    await expect(graph(page).getByRole("link", { name: "Alpha" })).toBeVisible();
    const initial = await viewport(page);
    const box = await graph(page).locator("svg").boundingBox();
    if (box === null) {
      throw new Error("the graph is not visible");
    }

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -400);

    await expect.poll(async () => (await viewport(page)).scale).toBeGreaterThan(initial.scale);
  });

  test("pans by dragging the background", async ({ page }) => {
    await page.goto("/graph");
    await expect(graph(page).getByRole("link", { name: "Alpha" })).toBeVisible();
    const initial = await viewport(page);
    const box = await graph(page).locator("svg").boundingBox();
    if (box === null) {
      throw new Error("the graph is not visible");
    }

    await page.mouse.move(box.x + 24, box.y + 24);
    await page.mouse.down();
    await page.mouse.move(box.x + 90, box.y + 70, { steps: 8 });
    await page.mouse.up();

    const moved = await viewport(page);
    expect(moved.x).toBeGreaterThan(initial.x);
    expect(moved.y).toBeGreaterThan(initial.y);
    expect(moved.scale).toBeCloseTo(initial.scale, 5);
  });

  test("drags a node without opening its note", async ({ page }) => {
    await page.goto("/graph");
    const gamma = graph(page).getByRole("link", { name: "Gamma" });
    await expect(gamma).toBeVisible();
    const before = await nodePosition(gamma);
    const box = await gamma.locator("circle").boundingBox();
    if (box === null) {
      throw new Error("the node is not visible");
    }

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 10 });
    await page.mouse.up();

    await expect.poll(() => nodePosition(gamma)).not.toBe(before);
    await expect(page).toHaveURL(/\/graph$/);
  });

  test("keeps the layout when the page is left and reopened", async ({ page }) => {
    await page.goto("/graph");
    await expect(graph(page).getByRole("link", { name: "Alpha" })).toBeVisible();

    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Dashboard" })
      .click();
    await page
      .getByRole("navigation", { name: "Main navigation" })
      .getByRole("link", { name: "Graph" })
      .click();

    await expect(graph(page).getByRole("link", { name: "Alpha" })).toBeVisible();
    await expect(page.getByText("4 notes · 3 links")).toBeVisible();
  });
});

test.describe("the graph of an empty vault", () => {
  test.use({ seed: emptyVaultSeed });

  test("tells there is nothing to show", async ({ page }) => {
    await page.goto("/graph");

    await expect(page.getByRole("heading", { name: "No notes to show" })).toBeVisible();
  });
});
