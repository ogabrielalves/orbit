export type NewParam = 1;

export function parseNewParam(value: unknown): NewParam | undefined {
  const isRequested = value === 1 || value === "1";
  return isRequested ? 1 : undefined;
}
