import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import CloseIcon from "@/assets/icons/linha/fechar.svg?react";
import { IconButton } from "@/components/atoms/IconButton";

type DrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  headerActions?: ReactNode;
  children: ReactNode;
};

export function Drawer({
  isOpen,
  onClose,
  title,
  closeLabel,
  headerActions,
  children,
}: DrawerProps) {
  const hasHeaderActions = headerActions !== undefined;

  function handleEscapeKeyDown(event: KeyboardEvent) {
    const target = event.target instanceof Element ? event.target : null;
    const isInsideEscapeScope = target?.closest("[data-escape-scope]") != null;
    if (isInsideEscapeScope) {
      event.preventDefault();
    }
  }

  function handleOpenChange(nextIsOpen: boolean) {
    const shouldClose = !nextIsOpen;
    if (shouldClose) {
      onClose();
    }
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-overlay motion-reduce:animate-none" />
        <Dialog.Content
          aria-describedby={undefined}
          onEscapeKeyDown={handleEscapeKeyDown}
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-drawer animate-slide-in flex-col bg-surface shadow-lg motion-reduce:animate-none"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-6 py-4">
            <Dialog.Title className="font-display text-heading-3 font-semibold text-fg">
              {title}
            </Dialog.Title>
            <div className="flex items-center gap-1">
              {hasHeaderActions && headerActions}
              <Dialog.Close asChild>
                <IconButton icon={CloseIcon} label={closeLabel} />
              </Dialog.Close>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
