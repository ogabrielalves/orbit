export type LayoutNode = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  isPinned: boolean;
};

export type LayoutEdge = {
  source: string;
  target: string;
  weight: number;
};

export type LayoutInput = {
  id: string;
  degree: number;
};

export type Simulation = {
  nodes: LayoutNode[];
  step: () => void;
  settle: (maxIterations: number) => void;
  isActive: () => boolean;
  reheat: (alpha?: number) => void;
  pin: (id: string, x: number, y: number) => void;
  release: (id: string) => void;
};

const GOLDEN_ANGLE = 2.399963229728653;
const SPIRAL_SPACING = 28;
const REPULSION = 2600;
const SPRING_LENGTH = 76;
const SPRING_STRENGTH = 0.05;
const GRAVITY = 0.018;
const DAMPING = 0.62;
const ALPHA_DECAY = 0.965;
const ALPHA_MIN = 0.02;
const MIN_DISTANCE_SQUARED = 25;
const MAX_STEP = 40;
const MIN_RADIUS = 5;
const MAX_RADIUS = 16;
const RADIUS_PER_DEGREE = 2.4;

export function nodeRadius(degree: number): number {
  const grown = MIN_RADIUS + Math.sqrt(Math.max(degree, 0)) * RADIUS_PER_DEGREE;
  return Math.min(grown, MAX_RADIUS);
}

export function createSimulation(inputs: LayoutInput[], edges: LayoutEdge[]): Simulation {
  const nodes: LayoutNode[] = inputs.map((input, index) => {
    const angle = index * GOLDEN_ANGLE;
    const distance = SPIRAL_SPACING * Math.sqrt(index);
    return {
      id: input.id,
      x: Math.cos(angle) * distance,
      y: Math.sin(angle) * distance,
      vx: 0,
      vy: 0,
      radius: nodeRadius(input.degree),
      isPinned: false,
    };
  });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const links = edges.flatMap((edge) => {
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    const isKnown = source !== undefined && target !== undefined && source !== target;
    return isKnown ? [{ source, target, weight: edge.weight }] : [];
  });
  let alpha = 1;

  function applyRepulsion() {
    for (let i = 0; i < nodes.length; i += 1) {
      const a = nodes[i];
      if (a === undefined) {
        continue;
      }
      for (let j = i + 1; j < nodes.length; j += 1) {
        const b = nodes[j];
        if (b === undefined) {
          continue;
        }
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distanceSquared = Math.max(dx * dx + dy * dy, MIN_DISTANCE_SQUARED);
        const distance = Math.sqrt(distanceSquared);
        const force = (REPULSION * alpha) / distanceSquared;
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }
  }

  function applySprings() {
    for (const link of links) {
      const dx = link.target.x - link.source.x;
      const dy = link.target.y - link.source.y;
      const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const stretch = distance - SPRING_LENGTH;
      const strength = SPRING_STRENGTH * Math.min(1 + Math.log(Math.max(link.weight, 1)), 2);
      const force = stretch * strength * alpha;
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      link.source.vx += fx;
      link.source.vy += fy;
      link.target.vx -= fx;
      link.target.vy -= fy;
    }
  }

  function integrate() {
    for (const node of nodes) {
      if (node.isPinned) {
        node.vx = 0;
        node.vy = 0;
        continue;
      }
      node.vx += -node.x * GRAVITY * alpha;
      node.vy += -node.y * GRAVITY * alpha;
      node.vx *= DAMPING;
      node.vy *= DAMPING;
      node.x += Math.max(-MAX_STEP, Math.min(MAX_STEP, node.vx));
      node.y += Math.max(-MAX_STEP, Math.min(MAX_STEP, node.vy));
    }
  }

  function step() {
    applyRepulsion();
    applySprings();
    integrate();
    alpha *= ALPHA_DECAY;
  }

  return {
    nodes,
    step,
    settle(maxIterations) {
      let iterations = 0;
      while (alpha > ALPHA_MIN && iterations < maxIterations) {
        step();
        iterations += 1;
      }
    },
    isActive: () => alpha > ALPHA_MIN,
    reheat(nextAlpha = 0.5) {
      alpha = Math.max(alpha, nextAlpha);
    },
    pin(id, x, y) {
      const node = byId.get(id);
      if (node !== undefined) {
        node.x = x;
        node.y = y;
        node.isPinned = true;
      }
    },
    release(id) {
      const node = byId.get(id);
      if (node !== undefined) {
        node.isPinned = false;
      }
    },
  };
}

export function getNeighborIds(edges: LayoutEdge[], id: string): Set<string> {
  const neighbors = new Set<string>();
  for (const edge of edges) {
    if (edge.source === id) {
      neighbors.add(edge.target);
    }
    if (edge.target === id) {
      neighbors.add(edge.source);
    }
  }
  return neighbors;
}
