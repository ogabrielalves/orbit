export type CloseGuard = {
  hasPending: () => boolean;
  flush: () => Promise<boolean>;
};

const guards = new Set<CloseGuard>();

export function registerCloseGuard(guard: CloseGuard): () => void {
  guards.add(guard);
  return () => {
    guards.delete(guard);
  };
}

export function hasPendingCloseGuards(): boolean {
  return [...guards].some((guard) => guard.hasPending());
}

export async function flushCloseGuards(): Promise<boolean> {
  const pending = [...guards].filter((guard) => guard.hasPending());
  const results = await Promise.all(
    pending.map(async (guard) => {
      try {
        return await guard.flush();
      } catch {
        return false;
      }
    }),
  );
  return results.every(Boolean);
}
