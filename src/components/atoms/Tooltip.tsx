import * as RadixTooltip from "@radix-ui/react-tooltip";
import {
  createContext,
  type FocusEvent,
  type ReactElement,
  type ReactNode,
  useContext,
} from "react";

type TooltipProps = {
  label: string;
  shortcut?: string;
  side?: "top" | "right" | "bottom" | "left";
  isDisabled?: boolean;
  labelsTrigger?: boolean;
  children: ReactElement;
};

const SILENT_DESCRIPTION = " ";

const OPEN_DELAY_IN_MILLISECONDS = 300;

const TooltipProviderContext = createContext(false);

let isTabNavigation = false;
let isTracking = false;

function trackTabNavigation() {
  if (isTracking) {
    return;
  }
  isTracking = true;
  window.addEventListener(
    "keydown",
    (event) => {
      isTabNavigation = event.key === "Tab";
    },
    true,
  );
  window.addEventListener(
    "pointerdown",
    () => {
      isTabNavigation = false;
    },
    true,
  );
}

function handleFocus(event: FocusEvent) {
  if (!isTabNavigation) {
    event.preventDefault();
  }
}

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipProviderContext value>
      <RadixTooltip.Provider
        delayDuration={OPEN_DELAY_IN_MILLISECONDS}
        skipDelayDuration={OPEN_DELAY_IN_MILLISECONDS}
      >
        {children}
      </RadixTooltip.Provider>
    </TooltipProviderContext>
  );
}

function ProviderIfMissing({ children }: { children: ReactNode }) {
  const hasProvider = useContext(TooltipProviderContext);
  return hasProvider ? children : <TooltipProvider>{children}</TooltipProvider>;
}

export function Tooltip({
  label,
  shortcut,
  side = "top",
  isDisabled = false,
  labelsTrigger = false,
  children,
}: TooltipProps) {
  if (isDisabled) {
    return children;
  }

  trackTabNavigation();
  const hasShortcut = shortcut !== undefined;
  const spokenDescription = labelsTrigger ? (shortcut ?? SILENT_DESCRIPTION) : undefined;

  return (
    <ProviderIfMissing>
      <RadixTooltip.Root>
        <RadixTooltip.Trigger asChild onFocus={handleFocus}>
          {children}
        </RadixTooltip.Trigger>
        <RadixTooltip.Portal>
          <RadixTooltip.Content
            side={side}
            sideOffset={8}
            aria-label={spokenDescription}
            className="z-60 rounded-sm bg-surface-inverse px-2.5 py-1.5 text-caption text-fg-on-inverse"
          >
            {label}
            {hasShortcut && (
              <kbd className="ml-2 font-sans text-fg-on-inverse-muted">{shortcut}</kbd>
            )}
          </RadixTooltip.Content>
        </RadixTooltip.Portal>
      </RadixTooltip.Root>
    </ProviderIfMissing>
  );
}
