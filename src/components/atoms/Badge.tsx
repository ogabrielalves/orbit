import type { ReactNode } from "react";

type BadgeTone =
  | "danger"
  | "accent"
  | "primary"
  | "neutral"
  | "success"
  | "warning"
  | "info"
  | "outline";

type BadgeShape = "square" | "pill";

type BadgeProps = {
  tone?: BadgeTone;
  shape?: BadgeShape;
  hasDot?: boolean;
  children: ReactNode;
};

const toneClasses: Record<BadgeTone, string> = {
  danger: "bg-danger-soft text-danger-fg font-semibold",
  accent: "bg-accent-soft text-accent-fg font-semibold",
  primary: "bg-primary-soft text-primary-fg font-semibold",
  neutral: "bg-surface-muted text-fg-secondary font-semibold",
  success: "bg-success-soft text-success-fg font-semibold",
  warning: "bg-warning-soft text-warning-fg font-semibold",
  info: "bg-info-soft text-info-fg font-semibold",
  outline: "border border-border text-fg-secondary",
};

const shapeClasses: Record<BadgeShape, string> = {
  square: "rounded-xs",
  pill: "rounded-full",
};

export function Badge({
  tone = "neutral",
  shape = "square",
  hasDot = false,
  children,
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.75 text-caption whitespace-nowrap ${toneClasses[tone]} ${shapeClasses[shape]}`}
    >
      {hasDot && <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
