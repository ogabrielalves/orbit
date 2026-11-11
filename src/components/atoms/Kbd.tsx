import type { ComponentProps } from "react";

type KbdVariant = "default" | "strong" | "inverse" | "plain";

type KbdProps = Omit<ComponentProps<"kbd">, "className"> & {
  variant?: KbdVariant;
};

const variantClasses: Record<KbdVariant, string> = {
  default:
    "rounded-xs border border-border bg-surface-muted px-1.5 py-px font-sans text-micro text-fg-secondary",
  strong:
    "rounded-xs border border-border-strong bg-surface-muted px-1.5 py-0.5 font-sans text-caption font-medium text-fg-secondary",
  inverse: "font-sans text-micro text-fg-on-inverse-muted",
  plain: "font-sans text-micro text-fg-muted",
};

export function Kbd({ variant = "default", children, ...rest }: KbdProps) {
  return (
    <kbd className={variantClasses[variant]} {...rest}>
      {children}
    </kbd>
  );
}
