import { fileURLToPath } from "node:url";
import { build } from "vite";

const entry = fileURLToPath(new URL("./browser.ts", import.meta.url));
const sourceDirectory = fileURLToPath(new URL("../../src", import.meta.url));

type BuiltOutput = { type: string; code?: string };
type BuildResult = { output?: BuiltOutput[] };

let cached: Promise<string> | undefined;

async function compile(): Promise<string> {
  const built = await build({
    configFile: false,
    logLevel: "silent",
    resolve: { alias: { "@": sourceDirectory } },
    build: {
      write: false,
      minify: false,
      lib: { entry, formats: ["iife"], name: "OrbitE2E", fileName: "harness" },
    },
  });
  const results = (Array.isArray(built) ? built : [built]) as BuildResult[];
  const chunk = results.flatMap((result) => result.output ?? []).find((o) => o.type === "chunk");
  if (chunk?.code === undefined) {
    throw new Error("the e2e harness bundle produced no code");
  }
  return chunk.code;
}

export function buildHarnessBundle(): Promise<string> {
  cached ??= compile();
  return cached;
}
