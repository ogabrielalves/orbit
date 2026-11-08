import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode, RefObject } from "react";
import CloseIcon from "@/assets/icons/linha/fechar.svg?react";
import { IconButton } from "@/components/atoms/IconButton";

type ModalSize = "sm" | "lg";

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  closeLabel: string;
  description?: string;
  size?: ModalSize;
  initialFocusRef?: RefObject<HTMLElement | null>;
  footer?: ReactNode;
  children: ReactNode;
};

const sizeClasses: Record<ModalSize, string> = {
  sm: "max-w-110",
  lg: "max-w-220",
};

export function Modal({
  isOpen,
  onClose,
  title,
  closeLabel,
  description,
  size = "lg",
  initialFocusRef,
  footer,
  children,
}: ModalProps) {
  const hasDescription = description !== undefined;
  const hasFooter = footer !== undefined;
  const descriptionProps = hasDescription ? {} : { "aria-describedby": undefined };

  function handleOpenAutoFocus(event: Event) {
    const initialElement = initialFocusRef?.current;
    const hasInitialElement = initialElement !== null && initialElement !== undefined;
    if (hasInitialElement) {
      event.preventDefault();
      initialElement.focus();
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
          {...descriptionProps}
          onOpenAutoFocus={handleOpenAutoFocus}
          className={`fixed top-18 left-1/2 z-50 flex max-h-[calc(100vh-6rem)] w-[calc(100%-2rem)] -translate-x-1/2 animate-pop-in flex-col overflow-hidden rounded-3xl bg-surface shadow-lg motion-reduce:animate-none ${sizeClasses[size]}`}
        >
          <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-5">
            <div className="flex flex-col gap-0.5">
              <Dialog.Title className="font-display text-heading-2 font-semibold text-fg">
                {title}
              </Dialog.Title>
              {hasDescription && (
                <Dialog.Description className="text-small text-fg-muted">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close asChild>
              <IconButton icon={CloseIcon} label={closeLabel} />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {hasFooter && (
            <div className="flex items-center justify-between gap-3 border-t border-border px-6 py-4">
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
