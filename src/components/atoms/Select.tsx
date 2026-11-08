import type { ComponentProps } from "react";
import ChevronIcon from "@/assets/icons/linha/chevron-baixo.svg?react";
import { type ControlSize, controlHeightClasses } from "@/components/atoms/controlSize";

type SelectProps = Omit<ComponentProps<"select">, "className" | "size"> & {
  size?: ControlSize;
};

export function Select({ size = "md", children, ...rest }: SelectProps) {
  return (
    <div className="relative">
      <select
        className={`w-full appearance-none rounded-md border border-border-strong bg-surface pr-9 pl-3 text-small font-medium text-fg focus-visible:border-primary focus-visible:shadow-focus-input disabled:cursor-not-allowed disabled:bg-canvas disabled:text-fg-disabled ${controlHeightClasses[size]}`}
        {...rest}
      >
        {children}
      </select>
      <ChevronIcon
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-fg-muted"
      />
    </div>
  );
}
