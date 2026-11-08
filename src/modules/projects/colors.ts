export const projectColorKeys = [
  "orbit",
  "ember",
  "lagoon",
  "orchid",
  "violet",
  "moss",
  "amber",
  "graphite",
] as const;

export type ProjectColorKey = (typeof projectColorKeys)[number];

export const defaultProjectColorKey: ProjectColorKey = "orbit";

function isProjectColorKey(value: string): value is ProjectColorKey {
  return (projectColorKeys as readonly string[]).includes(value);
}

export function resolveProjectColor(color: string | null): string {
  const hasColor = color !== null;
  if (!hasColor) {
    return `var(--color-project-${defaultProjectColorKey})`;
  }

  const isKnownKey = isProjectColorKey(color);
  if (isKnownKey) {
    return `var(--color-project-${color})`;
  }

  const isHexColor = /^#[0-9a-f]{3,8}$/i.test(color);
  if (isHexColor) {
    return color;
  }

  return `var(--color-project-${defaultProjectColorKey})`;
}
