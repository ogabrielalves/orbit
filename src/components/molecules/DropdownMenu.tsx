import * as RadixMenu from "@radix-ui/react-dropdown-menu";
import { type ComponentType, Fragment, type ReactElement, type SVGProps } from "react";

export type DropdownMenuItemData = {
  id: string;
  label: string;
  onSelect: () => void;
  icon?: ComponentType<SVGProps<SVGSVGElement>>;
  shortcut?: string;
  isDanger?: boolean;
  isDisabled?: boolean;
};

type DropdownMenuProps = {
  trigger: ReactElement;
  sections: DropdownMenuItemData[][];
  align?: "start" | "center" | "end";
  onCloseAutoFocus?: (event: Event) => void;
  isOpen?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
};

export function DropdownMenu({
  trigger,
  sections,
  align = "end",
  onCloseAutoFocus,
  isOpen,
  onOpenChange,
}: DropdownMenuProps) {
  return (
    <RadixMenu.Root open={isOpen} onOpenChange={onOpenChange}>
      <RadixMenu.Trigger asChild>{trigger}</RadixMenu.Trigger>
      <RadixMenu.Portal>
        <RadixMenu.Content
          align={align}
          sideOffset={6}
          onCloseAutoFocus={onCloseAutoFocus}
          className="z-50 flex min-w-52.5 flex-col rounded-lg border border-border bg-surface p-1.5 shadow-md"
        >
          {sections.map((section, sectionIndex) => {
            const sectionKey = section.map((item) => item.id).join("|");
            const hasSeparator = sectionIndex > 0;

            return (
              <Fragment key={sectionKey}>
                {hasSeparator && <RadixMenu.Separator className="my-1 h-px bg-border" />}
                {section.map((item) => {
                  const Icon = item.icon;
                  const hasIcon = Icon !== undefined;
                  const hasShortcut = item.shortcut !== undefined;
                  const isDanger = item.isDanger ?? false;
                  const toneClass = isDanger ? "text-danger-fg" : "text-fg";

                  return (
                    <RadixMenu.Item
                      key={item.id}
                      disabled={item.isDisabled}
                      onSelect={item.onSelect}
                      className={`flex cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-2 text-small outline-none data-disabled:pointer-events-none data-disabled:text-fg-disabled data-highlighted:bg-surface-muted ${toneClass}`}
                    >
                      {hasIcon && <Icon aria-hidden="true" className="size-4 shrink-0" />}
                      <span className="flex-1">{item.label}</span>
                      {hasShortcut && (
                        <kbd className="font-sans text-micro text-fg-muted">{item.shortcut}</kbd>
                      )}
                    </RadixMenu.Item>
                  );
                })}
              </Fragment>
            );
          })}
        </RadixMenu.Content>
      </RadixMenu.Portal>
    </RadixMenu.Root>
  );
}
