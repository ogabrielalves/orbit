import { test as base, expect, type Page } from "@playwright/test";
import type { ErrorPayload } from "@/bindings";
import type { Seed } from "../fixture/state";
import { buildHarnessBundle } from "./bundle";
import type { RecordedCall } from "./controls";

export type OrbitApi = {
  setDialogResult: (value: string | string[] | null) => Promise<void>;
  failNext: (command: string, error: ErrorPayload) => Promise<void>;
  calls: (command: string) => Promise<RecordedCall[]>;
  emit: (event: string, payload?: unknown) => Promise<void>;
  storedState: () => Promise<unknown>;
};

function createOrbitApi(page: Page): OrbitApi {
  return {
    setDialogResult: (value) => page.evaluate((v) => window.__orbit?.setDialogResult(v), value),
    failNext: (command, error) =>
      page.evaluate(([c, e]) => window.__orbit?.failNext(c as string, e as ErrorPayload), [
        command,
        error,
      ] as const),
    calls: (command) =>
      page.evaluate(
        (name) => (window.__orbit?.calls ?? []).filter((call) => call.command === name),
        command,
      ),
    emit: (event, payload) =>
      page.evaluate(([e, p]) => window.__orbit?.emit(e as string, p), [event, payload] as const),
    storedState: () => page.evaluate(() => window.__orbit?.storedState()),
  };
}

type Fixtures = {
  seed: Seed;
  orbit: OrbitApi;
};

export const test = base.extend<Fixtures>({
  seed: [{}, { option: true }],
  orbit: [
    async ({ page, seed }, use) => {
      const bundle = await buildHarnessBundle();
      await page.addInitScript((value) => {
        window.__ORBIT_SEED__ = value;
      }, seed);
      await page.addInitScript({ content: bundle });
      await use(createOrbitApi(page));
      const unmocked = await page
        .evaluate(() => window.__orbit?.unmocked ?? [])
        .catch(() => [] as string[]);
      expect(unmocked, "commands the in-memory backend does not implement").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
