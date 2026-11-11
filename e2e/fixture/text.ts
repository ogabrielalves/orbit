import { fail } from "./failure";

export function requireText(label: string, value: string, max: number): string {
  const text = value.trim();
  if (text === "") {
    fail("VALIDATION", `${label} must not be blank`);
  }
  if ([...text].length > max) {
    fail("VALIDATION", `${label} cannot exceed ${max} characters`);
  }
  return text;
}

export function optionalText(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text === "" ? null : text;
}

export function textOrEmpty(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export function normalizeDate(value: string | null | undefined): string | null {
  const text = optionalText(value);
  if (text === null) {
    return null;
  }
  const isShapeValid = /^\d{4}-\d{2}-\d{2}$/.test(text);
  const parsed = new Date(`${text}T00:00:00Z`);
  const isRealDate = !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(text);
  if (!isShapeValid || !isRealDate) {
    fail("VALIDATION", "due date must be a date in YYYY-MM-DD format");
  }
  return text;
}
