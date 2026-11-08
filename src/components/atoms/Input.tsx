import type { ComponentProps, ComponentType, SVGProps } from "react";
import { type ControlSize, controlHeightClasses } from "@/components/atoms/controlSize";

type InputProps = Omit<ComponentProps<"input">, "className" | "size"> & {
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  size?: ControlSize;
  hasError?: boolean;
};

export function Input({ icon: Icon, size = "md", hasError = false, ...rest }: InputProps) {
  const hasIcon = Icon !== undefined;
  const borderClass = hasError
    ? "border-danger focus-within:shadow-focus-input"
    : "border-border-strong focus-within:border-primary focus-within:shadow-focus-input";

  return (
    <div
      className={`flex items-center gap-2 rounded-md border bg-surface px-3 has-disabled:bg-canvas has-disabled:text-fg-disabled ${controlHeightClasses[size]} ${borderClass}`}
    >
      {hasIcon && <Icon aria-hidden="true" className="size-4 shrink-0 text-fg-muted" />}
      <input
        aria-invalid={hasError}
        className="min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-muted focus-visible:shadow-none disabled:cursor-not-allowed"
        {...rest}
      />
    </div>
  );
}
