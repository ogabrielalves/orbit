function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatLongDate(date: Date, locale: string): string {
  const formatter = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return capitalize(formatter.format(date));
}

export function formatShortDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

const relativeTimeUnits = [
  { unit: "year", seconds: 365 * 24 * 60 * 60 },
  { unit: "month", seconds: 30 * 24 * 60 * 60 },
  { unit: "week", seconds: 7 * 24 * 60 * 60 },
  { unit: "day", seconds: 24 * 60 * 60 },
  { unit: "hour", seconds: 60 * 60 },
  { unit: "minute", seconds: 60 },
] as const;

export function formatRelativeTime(date: Date, now: Date, locale: string): string {
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const differenceInSeconds = (date.getTime() - now.getTime()) / 1000;
  const absoluteSeconds = Math.abs(differenceInSeconds);

  for (const { unit, seconds } of relativeTimeUnits) {
    const isAtLeastOneUnit = absoluteSeconds >= seconds;
    if (isAtLeastOneUnit) {
      return formatter.format(Math.trunc(differenceInSeconds / seconds), unit);
    }
  }

  return formatter.format(0, "second");
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function toLocalIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseLocalIsoDate(isoDate: string): Date {
  const [year = 0, month = 1, day = 1] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function formatDueDate(isoDate: string, now: Date, locale: string): string {
  const due = parseLocalIsoDate(isoDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysUntilDue = Math.round((due.getTime() - today.getTime()) / MS_PER_DAY);
  const isTodayOrTomorrow = daysUntilDue === 0 || daysUntilDue === 1;

  if (isTodayOrTomorrow) {
    return capitalize(
      new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(daysUntilDue, "day"),
    );
  }

  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(due);
}
