import type { Locator, Page } from "@playwright/test";
import { wikilinkSeed } from "../fixture/vaultSeeds";
import { expect, test } from "../harness/test";
import { editor, waitForAutosave } from "./support/notes";

type StoredNote = { id: string; path: string; body: string };
type VaultState = { notes: StoredNote[] };

async function noteBody(
  orbit: { storedState: () => Promise<unknown> },
  id: string,
): Promise<string | undefined> {
  const state = (await orbit.storedState()) as VaultState;
  return state.notes.find((note) => note.id === id)?.body;
}

function connections(page: Page): Locator {
  return page.getByRole("region", { name: "Connections" });
}

function mentionedIn(page: Page): Locator {
  return connections(page)
    .locator("div", { has: page.getByRole("heading", { name: "Mentioned in" }) })
    .last();
}

function linksFromThisNote(page: Page): Locator {
  return connections(page)
    .locator("div", { has: page.getByRole("heading", { name: "Links from this note" }) })
    .last();
}

async function typeAtTheEnd(page: Page, text: string) {
  await editor(page).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type(text);
}

test.use({ seed: wikilinkSeed });

test.describe("typing a link", () => {
  test("suggests the notes of the vault after two opening brackets", async ({ page }) => {
    await page.goto("/notes/seed-gamma");
    await expect(editor(page)).toContainText("Standalone.");

    await typeAtTheEnd(page, "See [[");

    const suggestions = page.getByRole("listbox", { name: "Note suggestions" });
    await expect(suggestions.getByRole("option", { name: /^Alpha/ })).toBeVisible();
    await expect(suggestions.getByRole("option", { name: /^Beta/ })).toBeVisible();
    await expect(suggestions.getByRole("option", { name: /^Delta/ })).toBeVisible();
  });

  test("narrows the suggestions as the title is typed", async ({ page }) => {
    await page.goto("/notes/seed-gamma");
    await expect(editor(page)).toContainText("Standalone.");

    await typeAtTheEnd(page, "See [[Be");

    const suggestions = page.getByRole("listbox", { name: "Note suggestions" });
    await expect(suggestions.getByRole("option", { name: /^Beta/ })).toBeVisible();
    await expect(suggestions.getByRole("option", { name: /^Alpha/ })).toHaveCount(0);
  });

  test("tells when no note matches", async ({ page }) => {
    await page.goto("/notes/seed-gamma");
    await expect(editor(page)).toContainText("Standalone.");

    await typeAtTheEnd(page, "See [[zzz");

    await expect(page.getByText("No notes found")).toBeVisible();
  });

  test("inserts the chosen note as a link with Enter and saves it", async ({ page, orbit }) => {
    await page.goto("/notes/seed-gamma");
    await expect(editor(page)).toContainText("Standalone.");

    await typeAtTheEnd(page, "See [[Be");
    await page.keyboard.press("Enter");

    await expect(page.getByRole("listbox", { name: "Note suggestions" })).toHaveCount(0);
    await waitForAutosave(page);
    expect(await noteBody(orbit, "seed-gamma")).toContain("[[Beta]]");
    await expect(linksFromThisNote(page).getByRole("link", { name: /Beta/ })).toBeVisible();
  });

  test("moves through the suggestions with the arrow keys", async ({ page, orbit }) => {
    await page.goto("/notes/seed-gamma");
    await expect(editor(page)).toContainText("Standalone.");

    await typeAtTheEnd(page, "See [[");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    await waitForAutosave(page);
    expect(await noteBody(orbit, "seed-gamma")).toMatch(/\[\[(Beta|Delta|Gamma)\]\]/);
  });

  test("closes the suggestions with Escape without inserting anything", async ({ page, orbit }) => {
    await page.goto("/notes/seed-gamma");
    await expect(editor(page)).toContainText("Standalone.");

    await typeAtTheEnd(page, "See [[Be");
    await expect(page.getByRole("listbox", { name: "Note suggestions" })).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(page.getByRole("listbox", { name: "Note suggestions" })).toHaveCount(0);
    await waitForAutosave(page);
    expect(await noteBody(orbit, "seed-gamma")).not.toContain("[[Beta]]");
  });

  test("inserts the note with a mouse click on the suggestion", async ({ page, orbit }) => {
    await page.goto("/notes/seed-gamma");
    await expect(editor(page)).toContainText("Standalone.");

    await typeAtTheEnd(page, "See [[Al");
    await page.getByRole("option", { name: /^Alpha/ }).click();

    await waitForAutosave(page);
    expect(await noteBody(orbit, "seed-gamma")).toContain("[[Alpha]]");
  });
});

test.describe("following a link", () => {
  test("opens the note a link points to", async ({ page }) => {
    await page.goto("/notes/seed-alpha");
    await expect(editor(page)).toContainText("See Beta and Ghost note.");

    await editor(page).getByText("Beta", { exact: true }).click();

    await expect(page).toHaveURL(/\/notes\/seed-beta/);
    await expect(page.getByRole("heading", { level: 2, name: "Beta" })).toBeVisible();
  });

  test("resolves a link ignoring the case of the title", async ({ page }) => {
    await page.goto("/notes/seed-delta");
    await expect(editor(page)).toContainText("Mentions beta in lower case.");

    await editor(page).getByText("beta", { exact: true }).click();

    await expect(page).toHaveURL(/\/notes\/seed-beta/);
  });

  test("offers to create the note when the link points to nothing", async ({ page }) => {
    await page.goto("/notes/seed-alpha");
    await expect(editor(page)).toContainText("Ghost note");

    await editor(page).getByText("Ghost note", { exact: true }).click();

    const dialog = page.getByRole("alertdialog", { name: "Create “Ghost note”?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("No note with this title exists in the vault.");
  });

  test("creates the missing note and opens it", async ({ page, orbit }) => {
    await page.goto("/notes/seed-alpha");
    await expect(editor(page)).toContainText("Ghost note");
    await editor(page).getByText("Ghost note", { exact: true }).click();

    await page.getByRole("alertdialog").getByRole("button", { name: "Create note" }).click();

    await expect(page.getByText("Note created")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Ghost note" })).toBeVisible();
    const state = (await orbit.storedState()) as VaultState;
    expect(state.notes.map((note) => note.path)).toContain("Ghost note.md");
    const [created] = await orbit.calls("create_note");
    expect(created?.args).toEqual({ input: { title: "Ghost note", folderPath: null } });
  });

  test("leaves everything as it was when the creation is declined", async ({ page, orbit }) => {
    await page.goto("/notes/seed-alpha");
    await expect(editor(page)).toContainText("Ghost note");
    await editor(page).getByText("Ghost note", { exact: true }).click();

    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2, name: "Alpha" })).toBeVisible();
    expect(await orbit.calls("create_note")).toHaveLength(0);
  });

  test("creates the missing note from the connections panel", async ({ page }) => {
    await page.goto("/notes/seed-alpha");

    await linksFromThisNote(page)
      .getByRole("button", { name: /Ghost note/ })
      .click();

    await expect(page.getByRole("alertdialog", { name: "Create “Ghost note”?" })).toBeVisible();
  });
});

test.describe("connections", () => {
  test("lists the links from the note, marking the ones without a note", async ({ page }) => {
    await page.goto("/notes/seed-alpha");

    const outgoing = linksFromThisNote(page);

    await expect(outgoing.getByRole("link", { name: /Beta/ })).toBeVisible();
    await expect(outgoing.getByRole("button", { name: /Ghost note/ })).toContainText(
      "No note — create",
    );
  });

  test("lists the notes that mention this one with how many times", async ({ page }) => {
    await page.goto("/notes/seed-beta");

    const mentions = mentionedIn(page);

    await expect(mentions.getByRole("link", { name: /Alpha/ })).toContainText("1 link");
    await expect(mentions.getByRole("link", { name: /Delta/ })).toContainText("1 link");
  });

  test("says so when nothing points to the note", async ({ page }) => {
    await page.goto("/notes/seed-gamma");

    await expect(page.getByText("No note points to this one.")).toBeVisible();
    await expect(page.getByText("This note does not point to others.")).toBeVisible();
  });

  test("opens a note from the mentioned in list", async ({ page }) => {
    await page.goto("/notes/seed-beta");

    await mentionedIn(page).getByRole("link", { name: /Alpha/ }).click();

    await expect(page).toHaveURL(/\/notes\/seed-alpha/);
    await expect(page.getByRole("heading", { level: 2, name: "Alpha" })).toBeVisible();
  });

  test("shows the neighbours in the local graph and opens one", async ({ page }) => {
    await page.goto("/notes/seed-alpha");

    const graph = page.getByRole("region", { name: "Local graph" });
    await expect(graph.getByRole("link", { name: "Beta" })).toBeVisible();
    await graph.getByRole("link", { name: "Beta" }).click();

    await expect(page).toHaveURL(/\/notes\/seed-beta/);
  });

  test("tells a note without connections has no local graph", async ({ page }) => {
    await page.goto("/notes/seed-gamma");

    await expect(
      page
        .getByRole("region", { name: "Local graph" })
        .getByText("This note is not connected to other notes yet."),
    ).toBeVisible();
  });
});

test.describe("keeping links in sync", () => {
  test("renaming a note rewrites the links that point to it", async ({ page, orbit }) => {
    await page.goto("/notes/seed-beta");
    await expect(page.getByRole("heading", { level: 2, name: "Beta" })).toBeVisible();

    await page.getByRole("button", { name: "Note actions" }).click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    await page.getByLabel("Title").fill("Beta prime");
    await page
      .getByRole("dialog", { name: "Rename note" })
      .getByRole("button", { name: "Rename" })
      .click();

    await expect(page.getByText("Note renamed · 2 links updated")).toBeVisible();
    expect(await noteBody(orbit, "seed-alpha")).toContain("[[Beta prime]]");
    expect(await noteBody(orbit, "seed-alpha")).not.toContain("[[Beta]]");
    expect(await noteBody(orbit, "seed-delta")).toContain("[[Beta prime]]");
    await expect(mentionedIn(page).getByRole("link", { name: /Alpha/ })).toBeVisible();
  });

  test("deleting a note leaves the links to it without a note", async ({ page }) => {
    await page.goto("/notes/seed-beta");
    await expect(page.getByRole("heading", { level: 2, name: "Beta" })).toBeVisible();

    await page.getByRole("button", { name: "Note actions" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Select a note")).toBeVisible();
    await page.goto("/notes/seed-alpha");

    await expect(linksFromThisNote(page).getByRole("button", { name: /Beta/ })).toContainText(
      "No note — create",
    );
  });

  test("a link to a title is resolved again once a note gets that title", async ({ page }) => {
    await page.goto("/notes/seed-alpha");
    await linksFromThisNote(page)
      .getByRole("button", { name: /Ghost note/ })
      .click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Create note" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Ghost note" })).toBeVisible();

    await mentionedIn(page).getByRole("link", { name: /Alpha/ }).click();

    await expect(linksFromThisNote(page).getByRole("link", { name: /Ghost note/ })).toBeVisible();
  });
});
