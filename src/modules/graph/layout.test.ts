import { describe, expect, it } from "vitest";
import { createSimulation, getNeighborIds, nodeRadius } from "@/modules/graph/layout";

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

const inputs = [
  { id: "a", degree: 1 },
  { id: "b", degree: 2 },
  { id: "c", degree: 1 },
  { id: "d", degree: 0 },
];
const edges = [
  { source: "a", target: "b", weight: 1 },
  { source: "b", target: "c", weight: 1 },
];

function byId(simulation: ReturnType<typeof createSimulation>, id: string) {
  const node = simulation.nodes.find((candidate) => candidate.id === id);
  if (node === undefined) {
    throw new Error(`missing node ${id}`);
  }
  return node;
}

describe("graph layout", () => {
  it("creates one node per input at finite positions", () => {
    const simulation = createSimulation(inputs, edges);
    simulation.settle(300);

    expect(simulation.nodes.map((node) => node.id)).toEqual(["a", "b", "c", "d"]);
    for (const node of simulation.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
  });

  it("is deterministic", () => {
    const first = createSimulation(inputs, edges);
    const second = createSimulation(inputs, edges);
    first.settle(300);
    second.settle(300);

    expect(first.nodes.map((node) => [node.x, node.y])).toEqual(
      second.nodes.map((node) => [node.x, node.y]),
    );
  });

  it("settles and stops being active", () => {
    const simulation = createSimulation(inputs, edges);

    expect(simulation.isActive()).toBe(true);
    simulation.settle(1000);

    expect(simulation.isActive()).toBe(false);
  });

  it("keeps linked nodes near the spring length and never overlaps nodes", () => {
    const simulation = createSimulation(inputs, edges);
    simulation.settle(300);

    const linked = distance(byId(simulation, "a"), byId(simulation, "b"));
    expect(linked).toBeGreaterThan(30);
    expect(linked).toBeLessThan(150);
    for (const first of simulation.nodes) {
      for (const second of simulation.nodes) {
        if (first !== second) {
          expect(distance(first, second)).toBeGreaterThan(first.radius);
        }
      }
    }
  });

  it("ignores edges to unknown nodes and self loops", () => {
    const simulation = createSimulation(inputs, [
      { source: "a", target: "zzz", weight: 1 },
      { source: "a", target: "a", weight: 1 },
    ]);

    expect(() => simulation.settle(50)).not.toThrow();
  });

  it("holds a pinned node in place and lets it go on release", () => {
    const simulation = createSimulation(inputs, edges);
    simulation.settle(300);
    simulation.pin("a", 500, 500);
    simulation.reheat(0.5);
    for (let index = 0; index < 20; index += 1) {
      simulation.step();
    }

    expect(byId(simulation, "a").x).toBe(500);
    expect(byId(simulation, "a").y).toBe(500);

    simulation.release("a");
    for (let index = 0; index < 20; index += 1) {
      simulation.step();
    }

    expect(byId(simulation, "a").x).not.toBe(500);
  });

  it("reheats a settled simulation", () => {
    const simulation = createSimulation(inputs, edges);
    simulation.settle(1000);

    simulation.reheat();

    expect(simulation.isActive()).toBe(true);
  });

  it("grows the radius with the degree up to a limit", () => {
    expect(nodeRadius(0)).toBeLessThan(nodeRadius(4));
    expect(nodeRadius(4)).toBeLessThan(nodeRadius(9));
    expect(nodeRadius(10_000)).toBe(16);
  });

  it("finds the neighbors on both ends of the edges", () => {
    expect([...getNeighborIds(edges, "b")].sort()).toEqual(["a", "c"]);
    expect([...getNeighborIds(edges, "a")]).toEqual(["b"]);
    expect(getNeighborIds(edges, "d").size).toBe(0);
  });
});
