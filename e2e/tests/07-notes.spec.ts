import type { Locator, Page } from "@playwright/test";
import { emptyVaultSeed, notesSeed } from "../fixture/vaultSeeds";
import { expect, test } from "../harness/test";
import { editor, waitForAutosave } from "./support/notes";

type StoredNote = { id: string; path: string; body: string; tags: string[] };
type VaultState = { folders: string[]; notes: StoredNote[]; favorites: unknown[] };

async function vault(orbit: { storedState: () => Promise<unknown> }): Promise<VaultState> {
  return (await orbit.storedState()) as VaultState;
}

function folderTree(page: Page): Locator {
  return page.getByRole("navigation", { name: "Folders" });
}

function noteList(page: Page): Locator {
  return page.getByRole("list", { name: "Notes" });
}

async function openNoteMenuItem(page: Page, item: string) {
  await page.getByRole("button", { name: "Note actions" }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

async function createFolder(page: Page, name: string) {
  await folderTree(page).getByRole("button", { name: "New folder" }).click();
  await page.getByLabel("Folder name").fill(name);
  await page
    .getByRole("dialog", { name: "New folder" })
    .getByRole("button", { name: "Create" })
    .click();
}

async function createNote(page: Page, title: string) {
  await page.getByRole("button", { name: "New note", exact: true }).click();
  await page.getByLabel("Title").fill(title);
  await page
    .getByRole("dialog", { name: "New note" })
    .getByRole("button", { name: "Create" })
    .click();
}

async function dragTo(page: Page, source: Locator, target: Locator) {
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (from === null || to === null) {
    throw new Error("the drag source or target is not visible");
  }
  const startX = from.x + from.width / 2;
  const startY = from.y + from.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + 12, startY + 12, { steps: 4 });
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 25 });
  await page.mouse.up();
}

test.describe("notes in an empty vault", () => {
  test.use({ seed: emptyVaultSeed });

  test("shows the empty states before anything exists", async ({ page }) => {
    await page.goto("/notes");

    await expect(page.getByRole("heading", { name: "No notes here yet" })).toBeVisible();
    await expect(page.getByText("Select a note")).toBeVisible();
    await expect(folderTree(page).getByRole("button", { name: "All notes" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  test("creates a folder and selects it", async ({ page, orbit }) => {
    await page.goto("/notes");

    await createFolder(page, "Meetings");

    await expect(page.getByText("Folder created")).toBeVisible();
    await expect(folderTree(page).getByRole("button", { name: /^Meetings/ })).toHaveAttribute(
      "aria-current",
      "true",
    );
    await expect(page).toHaveURL(/folder=Meetings/);
    expect((await vault(orbit)).folders).toEqual(["Meetings"]);
  });

  test("creates a note inside the selected folder and opens it", async ({ page, orbit }) => {
    await page.goto("/notes");
    await createFolder(page, "Meetings");

    await createNote(page, "Weekly review");

    await expect(page.getByText("Note created")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Weekly review" })).toBeVisible();
    await expect(page).toHaveURL(/\/notes\/[^/?]+\?folder=Meetings$/);
    await expect(noteList(page).getByRole("link", { name: /Weekly review/ })).toBeVisible();
    const [note] = (await vault(orbit)).notes;
    expect(note?.path).toBe("Meetings/Weekly review.md");
    expect(note?.body).toBe("\n# Weekly review\n");
    const [created] = await orbit.calls("create_note");
    expect(created?.args).toEqual({ input: { title: "Weekly review", folderPath: "Meetings" } });
  });

  test("creates a note at the vault root from the all notes view", async ({ page, orbit }) => {
    await page.goto("/notes");

    await createNote(page, "Inbox");

    await expect(page.getByRole("heading", { level: 2, name: "Inbox" })).toBeVisible();
    expect((await vault(orbit)).notes.map((note) => note.path)).toEqual(["Inbox.md"]);
  });

  test("does not accept two notes with the same name in a folder, ignoring case", async ({
    page,
    orbit,
  }) => {
    await page.goto("/notes");
    await createNote(page, "Inbox");
    await expect(page.getByRole("heading", { level: 2, name: "Inbox" })).toBeVisible();

    await createNote(page, "inbox");

    await expect(
      page.getByText("The item was changed elsewhere. Reload and try again."),
    ).toBeVisible();
    expect((await vault(orbit)).notes).toHaveLength(1);
  });

  test("rejects a name with a forbidden character and keeps the modal open", async ({
    page,
    orbit,
  }) => {
    await page.goto("/notes");

    await createNote(page, "a/b");

    await expect(page.getByText("The information provided is not valid.")).toBeVisible();
    await expect(page.getByRole("dialog", { name: "New note" })).toBeVisible();
    expect((await vault(orbit)).notes).toEqual([]);
  });

  test("keeps the create button disabled for a blank title", async ({ page }) => {
    await page.goto("/notes");
    await page.getByRole("button", { name: "New note", exact: true }).click();

    await page.getByLabel("Title").fill("   ");

    await expect(
      page.getByRole("dialog", { name: "New note" }).getByRole("button", { name: "Create" }),
    ).toBeDisabled();
  });

  test("rejects a reserved folder name", async ({ page, orbit }) => {
    await page.goto("/notes");

    await createFolder(page, "attachments");

    await expect(page.getByText("The information provided is not valid.")).toBeVisible();
    expect((await vault(orbit)).folders).toEqual([]);
  });
});

test.describe("working with notes", () => {
  test.use({ seed: notesSeed });

  test("lists the folders and the notes of the whole vault", async ({ page }) => {
    await page.goto("/notes");

    await expect(folderTree(page).getByRole("button", { name: /^Ideas/ })).toBeVisible();
    await expect(folderTree(page).getByRole("button", { name: /^Work/ })).toBeVisible();
    await expect(noteList(page).getByRole("link")).toHaveCount(4);
  });

  test("filters the list by the selected folder", async ({ page }) => {
    await page.goto("/notes");

    await folderTree(page).getByRole("button", { name: /^Work/ }).click();

    await expect(noteList(page).getByRole("link", { name: /Roadmap/ })).toBeVisible();
    await expect(noteList(page).getByRole("link")).toHaveCount(1);
    await expect(page).toHaveURL(/folder=Work/);
  });

  test("opens a note from the list", async ({ page }) => {
    await page.goto("/notes");

    await noteList(page)
      .getByRole("link", { name: /Welcome/ })
      .click();

    await expect(page.getByRole("heading", { level: 2, name: "Welcome" })).toBeVisible();
    await expect(editor(page)).toContainText("A first note.");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  });

  test("edits the note in the editor and saves it by itself", async ({ page, orbit }) => {
    await page.goto("/notes/seed-n1");
    await expect(editor(page)).toContainText("A first note.");

    await editor(page).click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Second line added by the test");

    await waitForAutosave(page);
    const [note] = (await vault(orbit)).notes.filter((candidate) => candidate.id === "seed-n1");
    expect(note?.body).toContain("Second line added by the test");
    expect(note?.body).toContain("A first note.");
  });

  test("sends one save for a burst of typing, with the hash it opened with", async ({
    page,
    orbit,
  }) => {
    await page.goto("/notes/seed-n1");
    await expect(editor(page)).toContainText("A first note.");
    const [opened] = await orbit.calls("get_note");
    expect(opened?.args).toEqual({ id: "seed-n1" });

    await editor(page).click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" and some more words typed quickly");
    await waitForAutosave(page);

    const saves = await orbit.calls("save_note");
    expect(saves).toHaveLength(1);
    const [save] = saves;
    const args = save?.args as {
      id: string;
      input: { content: string; baseHash: string; force: boolean };
    };
    expect(args.id).toBe("seed-n1");
    expect(args.input.force).toBe(false);
    expect(args.input.content).toContain("and some more words typed quickly");
    expect(args.input.baseHash).not.toBe("");
  });

  test("keeps the edit after a reload", async ({ page }) => {
    await page.goto("/notes/seed-n1");
    await editor(page).click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" Persisted text");
    await waitForAutosave(page);

    await page.reload();

    await expect(editor(page)).toContainText("Persisted text");
  });

  test("shows the status after a failed save and saves again on retry", async ({ page, orbit }) => {
    await page.goto("/notes/seed-n1");
    await expect(editor(page)).toContainText("A first note.");
    await orbit.failNext("save_note", { code: "IO", message: "disk full" });

    await editor(page).click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" Unlucky text");

    await expect(page.getByText("Could not save")).toBeVisible();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  });

  test("renames a note, updating the file name and the heading", async ({ page, orbit }) => {
    await page.goto("/notes/seed-n1");
    await expect(page.getByRole("heading", { level: 2, name: "Welcome" })).toBeVisible();

    await openNoteMenuItem(page, "Rename");
    await page.getByLabel("Title").fill("Start here");
    await page
      .getByRole("dialog", { name: "Rename note" })
      .getByRole("button", { name: "Rename" })
      .click();

    await expect(page.getByText("Note renamed")).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Start here" })).toBeVisible();
    const renamed = (await vault(orbit)).notes.find((note) => note.id === "seed-n1");
    expect(renamed?.path).toBe("Start here.md");
    expect(renamed?.body).toContain("# Start here");
  });

  test("does not rename a note over another one in the same folder, ignoring case", async ({
    page,
    orbit,
  }) => {
    await page.goto("/notes");
    await folderTree(page).getByRole("button", { name: /^Work/ }).click();
    await createNote(page, "Plan B");
    await expect(page.getByRole("heading", { level: 2, name: "Plan B" })).toBeVisible();

    await openNoteMenuItem(page, "Rename");
    await page.getByLabel("Title").fill("ROADMAP");
    await page
      .getByRole("dialog", { name: "Rename note" })
      .getByRole("button", { name: "Rename" })
      .click();

    await expect(
      page.getByText("The item was changed elsewhere. Reload and try again."),
    ).toBeVisible();
    const paths = (await vault(orbit)).notes.map((note) => note.path);
    expect(paths).toContain("Work/Plan B.md");
    expect(paths).toContain("Work/Roadmap.md");
  });

  test("moves a note to another folder by dragging its handle", async ({ page, orbit }) => {
    await page.goto("/notes");

    await dragTo(
      page,
      page.getByRole("button", { name: "Move Welcome" }),
      folderTree(page).getByRole("button", { name: /^Ideas/ }),
    );

    await expect(page.getByText("Note “Welcome” moved to Ideas")).toBeVisible();
    expect((await vault(orbit)).notes.find((note) => note.id === "seed-n1")?.path).toBe(
      "Ideas/Welcome.md",
    );
    const [moved] = await orbit.calls("move_note");
    expect(moved?.args).toEqual({ id: "seed-n1", newFolderPath: "Ideas" });
  });

  test("moves a note back to the vault root by dropping it on all notes", async ({
    page,
    orbit,
  }) => {
    await page.goto("/notes");

    await dragTo(
      page,
      page.getByRole("button", { name: "Move Roadmap" }),
      folderTree(page).getByRole("button", { name: "All notes" }),
    );

    await expect(page.getByText(/Note “Roadmap” moved to/)).toBeVisible();
    expect((await vault(orbit)).notes.find((note) => note.id === "seed-n3")?.path).toBe(
      "Roadmap.md",
    );
  });

  test("moves a folder under another one and brings its notes along", async ({ page, orbit }) => {
    await page.goto("/notes");

    await dragTo(
      page,
      page.getByRole("button", { name: "Move Ideas" }),
      folderTree(page).getByRole("button", { name: /^Work/ }),
    );

    await expect(page.getByText("Folder “Ideas” moved to Work")).toBeVisible();
    const state = await vault(orbit);
    expect(state.folders).toContain("Work/Ideas");
    expect(state.folders).not.toContain("Ideas");
    expect(state.notes.find((note) => note.id === "seed-n2")?.path).toBe(
      "Work/Ideas/Brainstorm.md",
    );
  });

  test("renames a folder from its menu and keeps the notes inside", async ({ page, orbit }) => {
    await page.goto("/notes");

    await folderTree(page).getByRole("button", { name: "Actions for Ideas" }).click();
    await page.getByRole("menuitem", { name: "Rename" }).click();
    await page.getByLabel("Folder name").fill("Concepts");
    await page
      .getByRole("dialog", { name: "Rename folder" })
      .getByRole("button", { name: "Rename" })
      .click();

    await expect(page.getByText("Folder renamed")).toBeVisible();
    const state = await vault(orbit);
    expect(state.folders).toContain("Concepts");
    expect(state.notes.find((note) => note.id === "seed-n2")?.path).toBe("Concepts/Brainstorm.md");
  });

  test("deletes a note after confirming", async ({ page, orbit }) => {
    await page.goto("/notes/seed-n1");
    await expect(page.getByRole("heading", { level: 2, name: "Welcome" })).toBeVisible();

    await openNoteMenuItem(page, "Delete");
    await expect(page.getByRole("alertdialog", { name: "Delete “Welcome”?" })).toBeVisible();
    await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();

    await expect(page.getByText("Note deleted")).toBeVisible();
    await expect(page.getByText("Select a note")).toBeVisible();
    await expect(noteList(page).getByRole("link", { name: /Welcome/ })).toHaveCount(0);
    expect((await vault(orbit)).notes.map((note) => note.id)).not.toContain("seed-n1");
  });

  test("keeps the note when the deletion is cancelled", async ({ page, orbit }) => {
    await page.goto("/notes/seed-n1");
    await expect(page.getByRole("heading", { level: 2, name: "Welcome" })).toBeVisible();

    await openNoteMenuItem(page, "Delete");
    await page.getByRole("alertdialog").getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByRole("heading", { level: 2, name: "Welcome" })).toBeVisible();
    expect((await vault(orbit)).notes.map((note) => note.id)).toContain("seed-n1");
  });

  test("deletes a folder with everything inside only after the strong confirmation", async ({
    page,
    orbit,
  }) => {
    await page.goto("/notes");

    await folderTree(page).getByRole("button", { name: "Actions for Work" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await expect(
      page.getByRole("alertdialog", {
        name: /Permanently delete “Work” and everything inside it\?/,
      }),
    ).toBeVisible();
    const confirmation = page.getByRole("alertdialog");
    await expect(confirmation.getByRole("button", { name: "Delete permanently" })).toBeDisabled();
    await confirmation.getByLabel(/Type Work to confirm/).fill("Work");
    await confirmation.getByRole("button", { name: "Delete permanently" }).click();

    await expect(page.getByText("Folder deleted")).toBeVisible();
    const state = await vault(orbit);
    expect(state.folders).toEqual(["Ideas"]);
    expect(state.notes.map((note) => note.id).sort()).toEqual(["seed-n1", "seed-n2"]);
    const [deleted] = await orbit.calls("delete_folder");
    expect(deleted?.args).toEqual({ path: "Work", recursive: true });
  });

  test("deletes an empty folder with the simple confirmation", async ({ page, orbit }) => {
    await page.goto("/notes");
    await createFolder(page, "Scratch");
    await expect(page.getByText("Folder created")).toBeVisible();

    await folderTree(page).getByRole("button", { name: "Actions for Scratch" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();
    await page
      .getByRole("alertdialog", { name: "Delete the folder “Scratch”?" })
      .getByRole("button", { name: "Delete" })
      .click();

    await expect(page.getByText("Folder deleted")).toBeVisible();
    expect((await vault(orbit)).folders).not.toContain("Scratch");
  });
});
