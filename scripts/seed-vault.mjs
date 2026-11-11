import { randomUUID } from "node:crypto";
import { mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";

const DEFAULT_NOTES = 1000;
const DEFAULT_FOLDERS = 40;
const MAX_NOTES = 20000;
const MAX_FOLDERS = 2000;
const WORDS = [
  "orbit",
  "kanban",
  "sprint",
  "backlog",
  "roadmap",
  "design",
  "review",
  "release",
  "metrics",
  "ideas",
  "meeting",
  "research",
  "journal",
  "reading",
  "planning",
  "retro",
  "spec",
  "draft",
  "archive",
  "notes",
];

function usage() {
  return [
    "Usage: node scripts/seed-vault.mjs <target-folder> [--notes N] [--folders N] [--allow-non-empty]",
    "",
    "Writes a synthetic markdown vault into <target-folder> for profiling the app.",
    "The folder is required: there is no default location.",
  ].join("\n");
}

function parseArguments(argv) {
  const options = {
    target: null,
    notes: DEFAULT_NOTES,
    folders: DEFAULT_FOLDERS,
    allowNonEmpty: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--notes") {
      index += 1;
      options.notes = Number(argv[index]);
    } else if (argument === "--folders") {
      index += 1;
      options.folders = Number(argv[index]);
    } else if (argument === "--allow-non-empty") {
      options.allowNonEmpty = true;
    } else if (argument === "--help" || argument === "-h") {
      options.target = null;
      options.help = true;
    } else if (argument.startsWith("--")) {
      throw new Error(`Unknown option ${argument}`);
    } else if (options.target === null) {
      options.target = argument;
    } else {
      throw new Error("Only one target folder is accepted");
    }
  }
  return options;
}

function assertSafeTarget(target, allowNonEmpty) {
  const resolved = resolve(target);
  const isRoot = parse(resolved).root === resolved;
  if (isRoot) {
    throw new Error("Refusing to write into a filesystem root");
  }
  if (resolved === resolve(homedir())) {
    throw new Error("Refusing to write into the home directory itself");
  }
  if (resolved === resolve(process.cwd())) {
    throw new Error("Refusing to write into the current working directory");
  }

  let isNonEmpty = false;
  try {
    const stats = statSync(resolved);
    if (!stats.isDirectory()) {
      throw new Error(`${resolved} exists and is not a directory`);
    }
    isNonEmpty = readdirSync(resolved).length > 0;
  } catch (error) {
    const isMissing = error instanceof Error && "code" in error && error.code === "ENOENT";
    if (!isMissing) {
      throw error;
    }
  }
  if (isNonEmpty && !allowNonEmpty) {
    throw new Error(`${resolved} is not empty. Pass --allow-non-empty to add notes to it`);
  }
  return resolved;
}

function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function buildFolders(count, random) {
  const folders = [];
  for (let index = 0; index < count; index += 1) {
    const name = `${WORDS[index % WORDS.length]}-${String(index).padStart(3, "0")}`;
    const canNest = folders.length > 0 && random() < 0.45;
    const parent = canNest ? folders[Math.floor(random() * folders.length)] : null;
    const depth = parent === null ? 0 : parent.depth + 1;
    const isTooDeep = depth > 3;
    folders.push({
      path: parent === null || isTooDeep ? name : `${parent.path}/${name}`,
      depth: isTooDeep ? 0 : depth,
    });
  }
  return folders.map((folder) => folder.path);
}

function buildNote(index, titles, random) {
  const title = `${WORDS[index % WORDS.length]} ${String(index).padStart(4, "0")}`;
  const linkCount = Math.floor(random() * 4);
  const links = [];
  for (let link = 0; link < linkCount; link += 1) {
    const target = titles[Math.floor(random() * titles.length)];
    if (target !== title) {
      links.push(`- See [[${target}]]`);
    }
  }
  const tags = [
    WORDS[Math.floor(random() * WORDS.length)],
    WORDS[Math.floor(random() * WORDS.length)],
  ];
  const created = new Date(Date.UTC(2026, 0, 1) + index * 3_600_000).toISOString();
  const body = [
    `# ${title}`,
    "",
    `Synthetic note ${index} used to profile long lists.`,
    "",
    ...links,
    "",
  ].join("\n");
  return {
    title,
    content: `---\nid: ${randomUUID()}\ncreated: ${created}\ntags: [${[...new Set(tags)].join(", ")}]\n---\n\n${body}`,
  };
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help || options.target === null) {
    process.stdout.write(`${usage()}
`);
    process.exit(options.help ? 0 : 1);
  }
  const notes = Math.min(Math.max(Math.floor(options.notes), 1), MAX_NOTES);
  const folderCount = Math.min(Math.max(Math.floor(options.folders), 0), MAX_FOLDERS);
  const target = assertSafeTarget(options.target, options.allowNonEmpty);

  const random = createRandom(20261111);
  const folders = buildFolders(folderCount, random);
  const titles = Array.from(
    { length: notes },
    (_, index) => `${WORDS[index % WORDS.length]} ${String(index).padStart(4, "0")}`,
  );

  mkdirSync(target, { recursive: true });
  for (const folder of folders) {
    mkdirSync(join(target, folder), { recursive: true });
  }

  for (let index = 0; index < notes; index += 1) {
    const note = buildNote(index, titles, random);
    const slot = index % (folders.length + 1);
    const directory = slot === 0 ? target : join(target, folders[slot - 1]);
    const file = join(directory, `${note.title}.md`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, note.content, { flag: "wx" });
  }

  process.stdout.write(`Wrote ${notes} notes in ${folders.length} folders to ${target}
`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}
`);
  process.exit(1);
}
