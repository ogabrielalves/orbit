export type Viewport = {
  x: number;
  y: number;
  scale: number;
};

export type Point = {
  x: number;
  y: number;
};

export type Size = {
  width: number;
  height: number;
};

export const MIN_SCALE = 0.15;
export const MAX_SCALE = 4;
export const ZOOM_STEP = 1.25;

export const identityViewport: Viewport = { x: 0, y: 0, scale: 1 };

function clampScale(scale: number): number {
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale));
}

export function zoomAt(viewport: Viewport, factor: number, anchor: Point): Viewport {
  const scale = clampScale(viewport.scale * factor);
  const ratio = scale / viewport.scale;
  return {
    scale,
    x: anchor.x - (anchor.x - viewport.x) * ratio,
    y: anchor.y - (anchor.y - viewport.y) * ratio,
  };
}

export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  return { ...viewport, x: viewport.x + dx, y: viewport.y + dy };
}

export function toGraphPoint(viewport: Viewport, point: Point): Point {
  return {
    x: (point.x - viewport.x) / viewport.scale,
    y: (point.y - viewport.y) / viewport.scale,
  };
}

export function fitViewport(points: Point[], size: Size, padding: number): Viewport {
  const hasPoints = points.length > 0;
  if (!hasPoints) {
    return { x: size.width / 2, y: size.height / 2, scale: 1 };
  }

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const contentWidth = Math.max(maxX - minX, 1);
  const contentHeight = Math.max(maxY - minY, 1);
  const availableWidth = Math.max(size.width - padding * 2, 1);
  const availableHeight = Math.max(size.height - padding * 2, 1);
  const scale = clampScale(
    Math.min(availableWidth / contentWidth, availableHeight / contentHeight, 1.5),
  );
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  return {
    scale,
    x: size.width / 2 - centerX * scale,
    y: size.height / 2 - centerY * scale,
  };
}
