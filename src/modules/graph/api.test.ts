import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchGraph, fetchLocalGraph } from "@/modules/graph/api";

const commands = vi.hoisted(() => ({ getGraph: vi.fn(), getLocalGraph: vi.fn() }));

vi.mock("@/bindings", () => ({ commands }));

const graph = { nodes: [], edges: [] };

describe("graph api", () => {
  beforeEach(() => {
    for (const command of Object.values(commands)) {
      command.mockReset();
    }
  });

  it("reads the whole graph", async () => {
    commands.getGraph.mockResolvedValue({ status: "ok", data: graph });

    await expect(fetchGraph({ includeUnresolved: true })).resolves.toEqual(graph);
    expect(commands.getGraph).toHaveBeenCalledWith({ includeUnresolved: true });
  });

  it("reads the graph around a note", async () => {
    commands.getLocalGraph.mockResolvedValue({ status: "ok", data: graph });
    const input = { noteId: "n1", depth: 2, includeUnresolved: false };

    await expect(fetchLocalGraph(input)).resolves.toEqual(graph);
    expect(commands.getLocalGraph).toHaveBeenCalledWith(input);
  });

  it("throws the command error", async () => {
    const error = { code: "DATABASE", message: "broken" };
    commands.getGraph.mockResolvedValue({ status: "error", error });

    await expect(fetchGraph({})).rejects.toEqual(error);
  });
});
