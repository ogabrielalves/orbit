const DEFAULT_WIDTH = 1440;

let viewportWidth = DEFAULT_WIDTH;
const listeners = new Set<() => void>();

function matchesQuery(query: string): boolean {
  const match = /\(min-width:\s*(\d+)px\)/.exec(query);
  const minWidth = match?.[1];
  const hasMinWidth = minWidth !== undefined;
  return hasMinWidth && viewportWidth >= Number(minWidth);
}

export function setViewportWidth(width: number): void {
  viewportWidth = width;
  for (const listener of listeners) {
    listener();
  }
}

export function resetViewport(): void {
  viewportWidth = DEFAULT_WIDTH;
}

export function installMatchMedia(): void {
  window.matchMedia = (query: string) =>
    ({
      get matches() {
        return matchesQuery(query);
      },
      media: query,
      addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    }) as unknown as MediaQueryList;
}
