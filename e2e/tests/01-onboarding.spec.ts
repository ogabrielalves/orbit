import { onboardedSeed } from "../fixture/seeds";
import { expect, test } from "../harness/test";

const vaultFolder = "C:UsersmeORBIT";

test.describe("onboarding", () => {
  test("sends a first-time user to the welcome screen", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/welcome$/);
    await expect(page.getByRole("heading", { level: 1, name: "Welcome to ORBIT" })).toBeVisible();
    await expect(page.getByText("No folder chosen")).toBeVisible();
    await expect(page.getByRole("button", { name: "Get started" })).toBeDisabled();
  });

  test("needs both a name and a folder before it can start", async ({ page, orbit }) => {
    await page.goto("/");
    const start = page.getByRole("button", { name: "Get started" });

    await page.getByLabel("What should we call you?").fill("Gabriel");
    await expect(start).toBeDisabled();

    await orbit.setDialogResult(vaultFolder);
    await page.getByRole("button", { name: "Choose folder" }).click();
    await expect(page.getByText(vaultFolder)).toBeVisible();
    await expect(start).toBeEnabled();

    await page.getByLabel("What should we call you?").fill("   ");
    await expect(start).toBeDisabled();
  });

  test("keeps the folder empty when the dialog is cancelled", async ({ page, orbit }) => {
    await page.goto("/");
    await orbit.setDialogResult(null);

    await page.getByRole("button", { name: "Choose folder" }).click();

    await expect(page.getByText("No folder chosen")).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose folder" })).toBeVisible();
  });

  test("limits the name to 60 characters", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByLabel("What should we call you?")).toHaveAttribute("maxlength", "60");
  });

  test("completes the onboarding and greets the user by name", async ({ page, orbit }) => {
    await page.goto("/");
    await orbit.setDialogResult(vaultFolder);

    await page.getByLabel("What should we call you?").fill("  Gabriel  ");
    await page.getByRole("button", { name: "Choose folder" }).click();
    await page.getByRole("button", { name: "Get started" }).click();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: /, Gabriel$/ })).toBeVisible();

    const [setup] = await orbit.calls("setup_vault");
    expect(setup?.args).toEqual({ input: { path: vaultFolder, create: true } });
    const [saved] = await orbit.calls("update_settings");
    expect(saved?.args).toEqual({ input: { userName: "Gabriel" } });
  });

  test("stays onboarded after a reload", async ({ page, orbit }) => {
    await page.goto("/");
    await orbit.setDialogResult(vaultFolder);
    await page.getByLabel("What should we call you?").fill("Gabriel");
    await page.getByRole("button", { name: "Choose folder" }).click();
    await page.getByRole("button", { name: "Get started" }).click();
    await expect(page).toHaveURL(/\/$/);

    await page.reload();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: /, Gabriel$/ })).toBeVisible();
    expect(await orbit.storedState()).toMatchObject({
      settings: { userName: "Gabriel", vaultPath: vaultFolder },
    });
  });

  test("explains a vault that cannot be used and lets the user try again", async ({
    page,
    orbit,
  }) => {
    await page.goto("/");
    await orbit.setDialogResult(vaultFolder);
    await orbit.failNext("setup_vault", { code: "IO", message: "denied" });
    await page.getByLabel("What should we call you?").fill("Gabriel");
    await page.getByRole("button", { name: "Choose folder" }).click();

    await page.getByRole("button", { name: "Get started" }).click();

    await expect(page.getByRole("alert")).toHaveText(
      "Could not access the files. Check the folder permissions.",
    );
    await expect(page).toHaveURL(/\/welcome$/);

    await page.getByRole("button", { name: "Get started" }).click();

    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("a user who already finished the onboarding", () => {
  test.use({ seed: onboardedSeed });

  test("goes straight to the dashboard", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: /, Gabriel$/ })).toBeVisible();
  });

  test("is sent back from the welcome screen", async ({ page }) => {
    await page.goto("/welcome");

    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Welcome to ORBIT" })).toHaveCount(0);
  });
});
