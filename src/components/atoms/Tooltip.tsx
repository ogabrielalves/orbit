import * as RadixTooltip from "@radix-ui/react-tooltip";
import type { ReactElement } from "react";

type TooltipProps = {
  label: string;
  shortcut?: string;
  side?: "top" | "right" | "bottom" | "left";
  isDisabled?: boolean;
  children: ReactElement;
};

export function Tooltip({
  label,
  shortcut,
  side = "top",
  isDisabled = false,
  children,
}: TooltipProps) {
  if (isDisabled) {
    return children;
  }

  const hasShortcut = shortcut !== undefined;

  return (
    <RadixTooltip.Root>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content
          side={side}
          sideOffset={8}
          className="z-50 rounded-sm bg-surface-inverse px-2.5 py-1.5 text-caption text-fg-on-inverse"
        >
          {label}
          {hasShortcut && <kbd className="ml-2 font-sans text-fg-on-inverse-muted">{shortcut}</kbd>}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  );
}
