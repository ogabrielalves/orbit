import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commands, type Graph, type GraphNode } from "@/bindings";
import { i18next } from "@/i18n";
import { renderApp } from "@/test/renderApp";
import { findTooltipText } from "@/test/tooltip";

const getGraph = vi.mocked(commands.getGraph);

function node(id: string, title: string, overrides: Partial<GraphNode> = {}): GraphNode {
  return { id, kind: "note", title, path: `${title}.md`, degree: 1, distance: null, ...overrides };
}

const graph: Graph = {
  nodes: [
    node("a", "Alpha"),
    node("b", "Beta", { degree: 2 }),
    node("c", "Gamma"),
    node("d", "Solo", { degree: 0 }),
  ],
  edges: [
    { source: "a", target: "b", weight: 1 },
    { source: "b", target: "c", weight: 2 },
  ],
};

function mockGraph(data: Graph) {
  getGraph.mockResolvedValue({ status: "ok", data });
}

function graphSvg(): SVGSVGElement {
  const section = screen.getByRole("region", { name: "Notes graph" });
  const svg = section.querySelector("svg");
  if (svg === null) {
    throw new Error("graph svg not found");
  }
  return svg;
}

function transformOf(): string {
  return graphSvg().querySelector(":scope > g")?.getAttribute("transform") ?? "";
}

function parseTransform(): { x: number; y: number; scale: number } {
  const match = /translate\(([-\d.e]+) ([-\d.e]+)\) scale\(([-\d.e]+)\)/.exec(transformOf());
  if (match === null) {
    throw new Error(`unexpected transform: ${transformOf()}`);
  }
  return { x: Number(match[1]), y: Number(match[2]), scale: Number(match[3]) };
}

function circleOpacityClass(title: string): string {
  const link = screen.getByRole("link", { name: title });
  return link.parentElement?.getAttribute("class") ?? "";
}

describe("GraphPage", () => {
  beforeEach(async () => {
    await i18next.changeLanguage("en");
    getGraph.mockReset();
    mockGraph(graph);
  });

  describe("states", () => {
    it("shows a loading placeholder", async () => {
      getGraph.mockReturnValue(new Promise(() => undefined));
      renderApp("/graph");

      const loading = await screen.findAllByRole("status");

      expect(loading[0]).toHaveTextContent("Loading…");
    });

    it("shows the empty state when there are no notes", async () => {
      mockGraph({ nodes: [], edges: [] });
      renderApp("/graph");

      expect(await screen.findByRole("heading", { name: "No notes to show" })).toBeInTheDocument();
    });

    it("shows the error and retries", async () => {
      let shouldFail = true;
      getGraph.mockImplementation(async () =>
        shouldFail
          ? { status: "error", error: { code: "DATABASE", message: "x" } }
          : { status: "ok", data: { nodes: [], edges: [] } },
      );
      renderApp("/graph");

      expect(await screen.findByText("Could not load the graph")).toBeInTheDocument();
      shouldFail = false;
      await userEvent.click(screen.getByRole("button", { name: "Try again" }));

      expect(await screen.findByRole("heading", { name: "No notes to show" })).toBeInTheDocument();
    });
  });

  describe("content", () => {
    it("draws every note as a link to it and every connection as a line", async () => {
      renderApp("/graph");

      const alpha = await screen.findByRole("link", { name: "Alpha" });

      expect(alpha).toHaveAttribute("href", "/notes/a");
      expect(screen.getByRole("link", { name: "Solo" })).toHaveAttribute("href", "/notes/d");
      expect(graphSvg().querySelectorAll("line")).toHaveLength(2);
      expect(screen.getByText("4 notes · 2 links")).toBeInTheDocument();
    });

    it("asks for unresolved links only when the option is on", async () => {
      renderApp("/graph");
      await screen.findByRole("link", { name: "Alpha" });
      expect(getGraph).toHaveBeenLastCalledWith({ includeUnresolved: false });

      await userEvent.click(screen.getByRole("checkbox", { name: "Show links without a note" }));

      await waitFor(() => expect(getGraph).toHaveBeenLastCalledWith({ includeUnresolved: true }));
    });

    it("draws unresolved notes without making them links", async () => {
      mockGraph({
        nodes: [node("a", "Alpha"), node("x", "Missing", { kind: "unresolved", path: null })],
        edges: [{ source: "a", target: "x", weight: 1 }],
      });
      renderApp("/graph");

      await screen.findByRole("link", { name: "Alpha" });

      expect(screen.queryByRole("link", { name: "Missing" })).not.toBeInTheDocument();
      expect(screen.getByText("Missing (note not created yet)")).toBeInTheDocument();
    });
  });

  describe("highlighting", () => {
    it("dims everything but a node and its neighbors while it is hovered", async () => {
      renderApp("/graph");
      const alpha = await screen.findByRole("link", { name: "Alpha" });
      expect(circleOpacityClass("Gamma")).not.toContain("opacity-25");

      fireEvent.pointerEnter(alpha);

      expect(circleOpacityClass("Alpha")).not.toContain("opacity-25");
      expect(circleOpacityClass("Beta")).not.toContain("opacity-25");
      expect(circleOpacityClass("Gamma")).toContain("opacity-25");
      expect(circleOpacityClass("Solo")).toContain("opacity-25");

      fireEvent.pointerLeave(alpha);

      expect(circleOpacityClass("Gamma")).not.toContain("opacity-25");
    });

    it("highlights on keyboard focus too", async () => {
      renderApp("/graph");
      const beta = await screen.findByRole("link", { name: "Beta" });

      beta.focus();

      await waitFor(() => expect(circleOpacityClass("Solo")).toContain("opacity-25"));
      expect(circleOpacityClass("Alpha")).not.toContain("opacity-25");
      expect(circleOpacityClass("Gamma")).not.toContain("opacity-25");

      beta.blur();

      await waitFor(() => expect(circleOpacityClass("Solo")).not.toContain("opacity-25"));
    });
  });

  describe("opening a note", () => {
    it("opens the note when a node is clicked", async () => {
      const router = renderApp("/graph");

      await userEvent.click(await screen.findByRole("link", { name: "Beta" }));

      await waitFor(() => expect(router.state.location.pathname).toBe("/notes/b"));
    });

    it("makes each note reachable with the keyboard as a real link", async () => {
      renderApp("/graph");
      const gamma = await screen.findByRole("link", { name: "Gamma" });

      gamma.focus();

      expect(gamma).toHaveFocus();
      expect(gamma).toHaveAttribute("href", "/notes/c");
    });

    it("does not open the note after dragging the node", async () => {
      const router = renderApp("/graph");
      const alpha = await screen.findByRole("link", { name: "Alpha" });

      fireEvent.pointerDown(alpha, { clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { clientX: 160, clientY: 140 });
      fireEvent.pointerUp(window, { clientX: 160, clientY: 140 });
      fireEvent.click(alpha);

      expect(router.state.location.pathname).toBe("/graph");
    });

    it("moves the node while it is dragged", async () => {
      renderApp("/graph");
      const alpha = await screen.findByRole("link", { name: "Alpha" });
      const before = alpha.parentElement?.getAttribute("transform");

      fireEvent.pointerDown(alpha, { clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { clientX: 220, clientY: 180 });

      await waitFor(() => expect(alpha.parentElement?.getAttribute("transform")).not.toBe(before));
      fireEvent.pointerUp(window);
    });
  });

  describe("zoom and pan", () => {
    it("zooms with the buttons and fits back", async () => {
      renderApp("/graph");
      await screen.findByRole("link", { name: "Alpha" });
      const initial = parseTransform();

      await userEvent.click(screen.getByRole("button", { name: "Zoom in" }));
      expect(parseTransform().scale).toBeGreaterThan(initial.scale);

      await userEvent.click(screen.getByRole("button", { name: "Zoom out" }));
      await userEvent.click(screen.getByRole("button", { name: "Zoom out" }));
      expect(parseTransform().scale).toBeLessThan(initial.scale);

      await userEvent.click(screen.getByRole("button", { name: "Fit to screen" }));
      const fitted = parseTransform();
      expect(fitted.scale).toBeCloseTo(initial.scale);
      expect(fitted.x).toBeCloseTo(initial.x);
      expect(fitted.y).toBeCloseTo(initial.y);
    });

    it("explains the zoom buttons with tooltips", async () => {
      renderApp("/graph");
      await screen.findByRole("link", { name: "Alpha" });

      await userEvent.hover(screen.getByRole("button", { name: "Zoom in" }));

      expect(await findTooltipText()).toContain("Zoom in");
    });

    it("zooms with the mouse wheel", async () => {
      renderApp("/graph");
      await screen.findByRole("link", { name: "Alpha" });
      const svg = graphSvg();
      const initial = parseTransform();

      fireEvent.wheel(svg, { deltaY: -100, clientX: 300, clientY: 200 });
      await waitFor(() => expect(parseTransform().scale).toBeGreaterThan(initial.scale));

      const zoomedIn = parseTransform();
      fireEvent.wheel(svg, { deltaY: 100, clientX: 300, clientY: 200 });
      await waitFor(() => expect(parseTransform().scale).toBeLessThan(zoomedIn.scale));
    });

    it("pans by dragging the background", async () => {
      renderApp("/graph");
      await screen.findByRole("link", { name: "Alpha" });
      const svg = graphSvg();
      const initial = parseTransform();

      fireEvent.pointerDown(svg, { clientX: 100, clientY: 100 });
      fireEvent.pointerMove(window, { clientX: 130, clientY: 120 });
      fireEvent.pointerUp(window);

      await waitFor(() => expect(parseTransform().x).toBeCloseTo(initial.x + 30));
      expect(parseTransform().y).toBeCloseTo(initial.y + 20);
      expect(parseTransform().scale).toBeCloseTo(initial.scale);
    });
  });
});
