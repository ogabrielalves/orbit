import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchSearch } from "@/modules/search/api";

const commands = vi.hoisted(() => ({ search: vi.fn() }));

vi.mock("@/bindings", () => ({ commands }));

const empty = { projects: [], boards: [], tasks: [], notes: [], folders: [] };

describe("search api", () => {
  beforeEach(() => {
    commands.search.mockReset();
  });

  it("sends the input and returns the grouped results", async () => {
    commands.search.mockResolvedValue({ status: "ok", data: empty });

    await expect(fetchSearch({ query: "plan" })).resolves.toEqual(empty);
    expect(commands.search).toHaveBeenCalledWith({ query: "plan" });
  });

  it("throws the command error", async () => {
    const error = { code: "DATABASE", message: "broken" };
    commands.search.mockResolvedValue({ status: "error", error });

    await expect(fetchSearch({ query: "plan" })).rejects.toEqual(error);
  });
});
