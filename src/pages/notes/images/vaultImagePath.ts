const ATTACHMENTS_PREFIX = "attachments/";
const EXTERNAL_SOURCE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;

export function toVaultImagePath(source: string): string | null {
  const trimmed = source.trim();
  const isExternal = EXTERNAL_SOURCE.test(trimmed);
  if (isExternal) {
    return null;
  }

  const decoded = safeDecode(trimmed).replaceAll("\\", "/");
  const segments = decoded
    .split("/")
    .filter((segment) => segment !== "" && segment !== "." && segment !== "..");
  const attachmentsIndex = segments.indexOf("attachments");
  const isInAttachments = attachmentsIndex >= 0 && segments.length === attachmentsIndex + 2;
  if (!isInAttachments) {
    return null;
  }

  return `${ATTACHMENTS_PREFIX}${segments[attachmentsIndex + 1]}`;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
