import type { ComponentProps, ComponentType, SVGProps } from "react";
import { Tooltip } from "@/components/atoms/Tooltip";

type IconButtonSize = "sm" | "md";

type IconButtonProps = Omit<ComponentProps<"button">, "className" | "children" | "aria-label"> & {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  size?: IconButtonSize;
  shortcut?: string;
};

const sizeClasses: Record<IconButtonSize, string> = {
  sm: "size-8",
  md: "size-9",
};

export function IconButton({
  icon: Icon,
  label,
  size = "md",
  shortcut,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <Tooltip label={label} shortcut={shortcut} labelsTrigger>
      <button
        type={type}
        aria-label={label}
        className={`inline-flex shrink-0 items-center justify-center rounded-md text-fg-secondary transition-colors hover:bg-surface-muted hover:text-fg disabled:cursor-not-allowed disabled:text-fg-subtle disabled:hover:bg-transparent ${sizeClasses[size]}`}
        {...rest}
      >
        <Icon aria-hidden="true" className="size-4.5" />
      </button>
    </Tooltip>
  );
}
