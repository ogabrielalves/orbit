import { fail } from "./failure";

export const ATTACHMENTS_DIRECTORY = "attachments";

const NAME_MAX_LENGTH = 120;
const FORBIDDEN_CHARACTERS = '<>:"/\\|?*';
const RESERVED_WINDOWS_NAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
]);

function isControl(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
}

export function validateName(label: string, raw: string): string {
  const name = raw.trim();
  if (name === "") {
    fail("VALIDATION", `${label} cannot be empty`);
  }
  if ([...name].length > NAME_MAX_LENGTH) {
    fail("VALIDATION", `${label} cannot exceed ${NAME_MAX_LENGTH} characters`);
  }
  const hasForbiddenCharacter = [...name].some(
    (character) => FORBIDDEN_CHARACTERS.includes(character) || isControl(character),
  );
  if (hasForbiddenCharacter) {
    fail("VALIDATION", `${label} contains a character that is not allowed`);
  }
  if (name.startsWith(".")) {
    fail("VALIDATION", `${label} cannot start with a dot`);
  }
  if (name.endsWith(".")) {
    fail("VALIDATION", `${label} cannot end with a dot`);
  }
  const stem = (name.split(".")[0] ?? name).trimEnd();
  if (RESERVED_WINDOWS_NAMES.has(stem.toUpperCase())) {
    fail("VALIDATION", `${label} is a reserved name`);
  }
  return name;
}

export function normalizeRelative(input: string): string {
  const trimmed = input.trim().replace(/^\/+|\/+$/g, "");
  if (trimmed === "") {
    return "";
  }
  const segments = trimmed.split("/");
  for (const segment of segments) {
    const isUnsafe =
      segment === "" ||
      segment === "." ||
      segment === ".." ||
      segment.startsWith(".") ||
      segment.includes("\\") ||
      segment.includes(":") ||
      segment.includes(String.fromCharCode(0));
    if (isUnsafe) {
      fail("VALIDATION", "invalid path inside the vault");
    }
  }
  if (segments[0] === ATTACHMENTS_DIRECTORY) {
    fail("VALIDATION", `'${ATTACHMENTS_DIRECTORY}' is reserved for pasted images`);
  }
  return segments.join("/");
}

export function parentOf(relative: string): string {
  const slash = relative.lastIndexOf("/");
  return slash === -1 ? "" : relative.slice(0, slash);
}

export function nameOf(relative: string): string {
  const slash = relative.lastIndexOf("/");
  return slash === -1 ? relative : relative.slice(slash + 1);
}

export function join(parent: string, name: string): string {
  return parent === "" ? name : `${parent}/${name}`;
}

export function isSameOrInside(candidate: string, ancestor: string): boolean {
  return candidate === ancestor || candidate.startsWith(`${ancestor}/`);
}
