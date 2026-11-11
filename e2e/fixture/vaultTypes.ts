export type StoredNote = {
  id: string;
  path: string;
  createdAt: string;
  modifiedAt: string;
  tags: string[];
  body: string;
};

export type SeedNote = {
  id: string;
  path: string;
  body: string;
  tags?: string[];
  createdAt?: string;
};

export const SEED_TIMESTAMP = "2026-11-02T10:00:00.000Z";

export function storedNoteFrom(seed: SeedNote): StoredNote {
  const createdAt = seed.createdAt ?? SEED_TIMESTAMP;
  return {
    id: seed.id,
    path: seed.path,
    createdAt,
    modifiedAt: createdAt,
    tags: seed.tags ?? [],
    body: seed.body,
  };
}
