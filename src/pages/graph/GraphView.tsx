import { Link } from "@tanstack/react-router";
import { type MouseEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Graph } from "@/bindings";
import { createSimulation, getNeighborIds } from "@/modules/graph/layout";
import {
  fitViewport,
  type Point,
  panBy,
  toGraphPoint,
  type Viewport,
  ZOOM_STEP,
  zoomAt,
} from "@/modules/graph/viewport";

const SETTLE_ITERATIONS = 300;
const DRAG_THRESHOLD_IN_PIXELS = 4;
const FIT_PADDING = 40;
const LABEL_MAX_LENGTH = 26;
const LABEL_ALWAYS_VISIBLE_LIMIT = 40;
const LABEL_MIN_SCALE = 0.8;
const DRAG_REHEAT = 0.35;

type GraphViewProps = {
  graph: Graph;
  width: number;
  height: number;
  label: string;
  centerId?: string;
  folder?: string;
};

type Gesture =
  | { kind: "pan"; lastX: number; lastY: number }
  | { kind: "node"; id: string; startX: number; startY: number; hasMoved: boolean };

function topologyKey(graph: Graph): string {
  const nodes = graph.nodes.map((node) => node.id).join("|");
  const edges = graph.edges.map((edge) => `${edge.source}>${edge.target}`).join("|");
  return `${nodes}#${edges}`;
}

function truncate(text: string): string {
  const isLong = text.length > LABEL_MAX_LENGTH;
  return isLong ? `${text.slice(0, LABEL_MAX_LENGTH - 1)}…` : text;
}

function GraphCanvas({ graph, width, height, label, centerId, folder }: GraphViewProps) {
  const { t } = useTranslation();
  const svgRef = useRef<SVGSVGElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const frameRef = useRef<number | null>(null);
  const wasDraggedRef = useRef(false);
  const [simulation] = useState(() => {
    const created = createSimulation(
      graph.nodes.map((node) => ({ id: node.id, degree: node.degree })),
      graph.edges,
    );
    created.settle(SETTLE_ITERATIONS);
    return created;
  });
  const [viewport, setViewport] = useState<Viewport>(() =>
    fitViewport(simulation.nodes, { width, height }, FIT_PADDING),
  );
  const viewportRef = useRef(viewport);
  const [, setFrameCount] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  const positions = new Map(simulation.nodes.map((node) => [node.id, node]));
  const hasActive = activeId !== null;
  const neighbors = hasActive ? getNeighborIds(graph.edges, activeId) : new Set<string>();
  const showAllLabels =
    graph.nodes.length <= LABEL_ALWAYS_VISIBLE_LIMIT || viewport.scale >= LABEL_MIN_SCALE;

  function toViewPoint(clientX: number, clientY: number): Point {
    const rect = svgRef.current?.getBoundingClientRect();
    const hasSize = rect !== undefined && rect.width > 0 && rect.height > 0;
    if (!hasSize) {
      return { x: clientX, y: clientY };
    }
    return {
      x: (clientX - rect.left) * (width / rect.width),
      y: (clientY - rect.top) * (height / rect.height),
    };
  }

  function animate() {
    if (frameRef.current !== null) {
      return;
    }
    const tick = () => {
      simulation.step();
      setFrameCount((count) => count + 1);
      frameRef.current = simulation.isActive() ? requestAnimationFrame(tick) : null;
    };
    frameRef.current = requestAnimationFrame(tick);
  }

  useEffect(
    () => () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    const svg = svgRef.current;
    if (svg === null) {
      return;
    }
    function handleWheel(event: WheelEvent) {
      event.preventDefault();
      const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      const rect = svg?.getBoundingClientRect();
      const hasSize = rect !== undefined && rect.width > 0 && rect.height > 0;
      const anchor = hasSize
        ? {
            x: (event.clientX - rect.left) * (width / rect.width),
            y: (event.clientY - rect.top) * (height / rect.height),
          }
        : { x: event.clientX, y: event.clientY };
      setViewport((current) => zoomAt(current, factor, anchor));
    }
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, [width, height]);

  function handleMove(event: globalThis.PointerEvent) {
    const gesture = gestureRef.current;
    if (gesture === null) {
      return;
    }
    if (gesture.kind === "pan") {
      const current = toViewPoint(event.clientX, event.clientY);
      const previous = toViewPoint(gesture.lastX, gesture.lastY);
      setViewport((value) => panBy(value, current.x - previous.x, current.y - previous.y));
      gesture.lastX = event.clientX;
      gesture.lastY = event.clientY;
      return;
    }
    const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
    if (distance > DRAG_THRESHOLD_IN_PIXELS) {
      gesture.hasMoved = true;
    }
    if (!gesture.hasMoved) {
      return;
    }
    const point = toGraphPoint(viewportRef.current, toViewPoint(event.clientX, event.clientY));
    simulation.pin(gesture.id, point.x, point.y);
    simulation.reheat(DRAG_REHEAT);
    animate();
  }

  function handleUp() {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    window.removeEventListener("pointermove", handleMove);
    window.removeEventListener("pointerup", handleUp);
    window.removeEventListener("pointercancel", handleUp);
    if (gesture?.kind === "node") {
      wasDraggedRef.current = gesture.hasMoved;
      simulation.release(gesture.id);
      simulation.reheat(DRAG_REHEAT);
      animate();
    }
  }

  function startGesture(gesture: Gesture) {
    gestureRef.current = gesture;
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  }

  function handleBackgroundPointerDown(event: PointerEvent<SVGSVGElement>) {
    startGesture({ kind: "pan", lastX: event.clientX, lastY: event.clientY });
  }

  function handleNodePointerDown(event: PointerEvent<Element>, id: string) {
    event.stopPropagation();
    wasDraggedRef.current = false;
    startGesture({
      kind: "node",
      id,
      startX: event.clientX,
      startY: event.clientY,
      hasMoved: false,
    });
  }

  function handleNodeClick(event: MouseEvent<Element>) {
    if (wasDraggedRef.current) {
      wasDraggedRef.current = false;
      event.preventDefault();
    }
  }

  function zoomFromCenter(factor: number) {
    setViewport((current) => zoomAt(current, factor, { x: width / 2, y: height / 2 }));
  }

  function fitToContent() {
    setViewport(fitViewport(simulation.nodes, { width, height }, FIT_PADDING));
  }

  return (
    <section
      aria-label={label}
      className="relative overflow-hidden rounded-xl border border-border bg-surface"
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        onPointerDown={handleBackgroundPointerDown}
        className="block w-full cursor-grab touch-none select-none active:cursor-grabbing"
      >
        <title>{label}</title>
        <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
          {graph.edges.map((edge) => {
            const source = positions.get(edge.source);
            const target = positions.get(edge.target);
            if (source === undefined || target === undefined) {
              return null;
            }
            const isIncident = edge.source === activeId || edge.target === activeId;
            const edgeClass = hasActive
              ? isIncident
                ? "stroke-primary"
                : "stroke-border opacity-40"
              : "stroke-border-strong";
            return (
              <line
                key={`${edge.source}>${edge.target}`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                strokeWidth={isIncident ? 2 : 1}
                vectorEffect="non-scaling-stroke"
                className={edgeClass}
              />
            );
          })}
          {graph.nodes.map((node) => {
            const position = positions.get(node.id);
            if (position === undefined) {
              return null;
            }
            const isUnresolved = node.kind === "unresolved";
            const isCenter = node.id === centerId;
            const isActive = node.id === activeId;
            const isRelated = isActive || neighbors.has(node.id);
            const dimClass = hasActive && !isRelated ? "opacity-25" : "";
            const fillClass = isCenter
              ? "fill-primary stroke-primary-strong"
              : isUnresolved
                ? "fill-surface-muted stroke-fg-subtle"
                : "fill-primary-muted stroke-primary";
            const showLabel = showAllLabels || isRelated || isCenter;
            const transform = `translate(${position.x} ${position.y})`;
            const shape = (
              <>
                <circle
                  r={position.radius}
                  strokeWidth={isActive ? 3 : 1.5}
                  strokeDasharray={isUnresolved ? "3 2" : undefined}
                  className={fillClass}
                />
                {showLabel && (
                  <text
                    y={position.radius + 13}
                    textAnchor="middle"
                    fontSize={11}
                    className="pointer-events-none fill-fg-secondary"
                  >
                    {truncate(node.title)}
                  </text>
                )}
              </>
            );
            const isLink = !isUnresolved && !isCenter;
            if (!isLink) {
              const title = isUnresolved
                ? t("graph.unresolvedNode", { title: node.title })
                : t("graph.currentNode", { title: node.title });
              return (
                <g key={node.id} transform={transform} className={dimClass}>
                  <title>{title}</title>
                  {shape}
                </g>
              );
            }
            return (
              <g key={node.id} transform={transform} className={dimClass}>
                <Link
                  to="/notes/$noteId"
                  params={{ noteId: node.id }}
                  search={{ folder }}
                  aria-label={node.title}
                  onPointerDown={(event) => handleNodePointerDown(event, node.id)}
                  onClick={handleNodeClick}
                  onPointerEnter={() => setActiveId(node.id)}
                  onPointerLeave={() => setActiveId(null)}
                  onFocus={() => setActiveId(node.id)}
                  onBlur={() => setActiveId(null)}
                  className="cursor-pointer outline-none [&:focus-visible>circle]:stroke-[3px]"
                >
                  {shape}
                </Link>
              </g>
            );
          })}
        </g>
      </svg>
      <div className="absolute top-3 right-3 flex flex-col gap-1 rounded-lg border border-border bg-surface p-1 shadow-sm">
        <button
          type="button"
          aria-label={t("graph.zoomIn")}
          onClick={() => zoomFromCenter(ZOOM_STEP)}
          className="flex size-8 items-center justify-center rounded-md text-heading-3 text-fg-secondary hover:bg-surface-muted"
        >
          +
        </button>
        <button
          type="button"
          aria-label={t("graph.zoomOut")}
          onClick={() => zoomFromCenter(1 / ZOOM_STEP)}
          className="flex size-8 items-center justify-center rounded-md text-heading-3 text-fg-secondary hover:bg-surface-muted"
        >
          −
        </button>
        <button
          type="button"
          aria-label={t("graph.fit")}
          onClick={fitToContent}
          className="flex size-8 items-center justify-center rounded-md text-caption font-semibold text-fg-secondary hover:bg-surface-muted"
        >
          {t("graph.fitShort")}
        </button>
      </div>
    </section>
  );
}

export function GraphView(props: GraphViewProps) {
  return <GraphCanvas key={topologyKey(props.graph)} {...props} />;
}
