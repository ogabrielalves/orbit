import type { Locator, Page } from "@playwright/test";
import { expect } from "../../harness/test";

export function editor(page: Page): Locator {
  return page.getByLabel("Note content").locator("[contenteditable='true']");
}

export async function waitForAutosave(page: Page): Promise<void> {
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
}
