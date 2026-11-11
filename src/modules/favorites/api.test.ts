import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchFavorites, moveFavorite, toggleFavorite } from "@/modules/favorites/api";

const commands = vi.hoisted(() => ({
  listFavorites: vi.fn(),
  toggleFavorite: vi.fn(),
  moveFavorite: vi.fn(),
}));

vi.mock("@/bindings", () => ({ commands }));

const reference = { entityType: "project" as const, entityId: "p1" };

describe("favorites api", () => {
  beforeEach(() => {
    for (const command of Object.values(commands)) {
      command.mockReset();
    }
  });

  it("lists the favorites", async () => {
    commands.listFavorites.mockResolvedValue({ status: "ok", data: [{ entityId: "p1" }] });

    await expect(fetchFavorites()).resolves.toEqual([{ entityId: "p1" }]);
  });

  it("toggles a reference and returns the new state", async () => {
    commands.toggleFavorite.mockResolvedValue({ status: "ok", data: true });

    await expect(toggleFavorite(reference)).resolves.toBe(true);
    expect(commands.toggleFavorite).toHaveBeenCalledWith(reference);
  });

  it("moves a favorite after another one", async () => {
    commands.moveFavorite.mockResolvedValue({ status: "ok", data: null });
    const after = { entityType: "project" as const, entityId: "p2" };

    await expect(moveFavorite(reference, after)).resolves.toBeNull();
    expect(commands.moveFavorite).toHaveBeenCalledWith(reference, after);
  });

  it("throws the command error", async () => {
    const error = { code: "NOT_FOUND", message: "gone" };
    commands.toggleFavorite.mockResolvedValue({ status: "error", error });

    await expect(toggleFavorite(reference)).rejects.toEqual(error);
  });
});
