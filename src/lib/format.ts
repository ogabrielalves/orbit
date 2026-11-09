const KILOBYTE = 1024;
const units = ["B", "KB", "MB", "GB"] as const;

export function formatFileSize(bytes: number, locale: string): string {
  let value = bytes;
  let unitIndex = 0;

  while (value >= KILOBYTE && unitIndex < units.length - 1) {
    value /= KILOBYTE;
    unitIndex += 1;
  }

  const isBytes = unitIndex === 0;
  const formatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: isBytes ? 0 : 1,
  });

  return `${formatter.format(value)} ${units[unitIndex]}`;
}
