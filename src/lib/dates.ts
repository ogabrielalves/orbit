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
