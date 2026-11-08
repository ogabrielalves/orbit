import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { type FormEvent, useId, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import TrashIcon from "@/assets/icons/linha/lixeira.svg?react";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";

type ConfirmTone = "danger" | "default";

type ConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  tone?: ConfirmTone;
  confirmationText?: string;
  isConfirming?: boolean;
  secondaryAction?: { label: string; onSelect: () => void };
};

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  tone = "default",
  confirmationText,
  isConfirming = false,
  secondaryAction,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const [typedText, setTypedText] = useState("");
  const inputId = useId();

  const isDanger = tone === "danger";
  const isTextRequired = confirmationText !== undefined;
  const isTextMatching = typedText === confirmationText;
  const canConfirm = !isTextRequired || isTextMatching;
  const hasSecondaryAction = secondaryAction !== undefined;
  const confirmVariant = isDanger ? "destructive" : "primary";

  function handleOpenChange(nextIsOpen: boolean) {
    const shouldClose = !nextIsOpen;
    if (shouldClose) {
      setTypedText("");
      onCancel();
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canConfirm) {
      onConfirm();
    }
  }

  return (
    <AlertDialog.Root open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-40 animate-fade-in bg-overlay motion-reduce:animate-none" />
        <AlertDialog.Content className="fixed top-1/3 left-1/2 z-50 w-[calc(100%-2rem)] max-w-100 -translate-x-1/2 animate-pop-in rounded-2xl bg-surface p-5.5 shadow-lg motion-reduce:animate-none">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {isDanger && (
              <span
                aria-hidden="true"
                className="flex size-10 items-center justify-center rounded-lg bg-danger-soft text-danger-fg"
              >
                <TrashIcon className="size-5" />
              </span>
            )}
            <AlertDialog.Title className="text-heading-3 font-semibold text-fg">
              {title}
            </AlertDialog.Title>
            <AlertDialog.Description className="text-small text-fg-secondary">
              {description}
            </AlertDialog.Description>
            {isTextRequired && (
              <div className="flex flex-col gap-1.5">
                <label htmlFor={inputId} className="text-caption text-fg-secondary">
                  <Trans
                    i18nKey="confirm.typeToConfirm"
                    values={{ text: confirmationText }}
                    components={{ strong: <strong className="text-fg" /> }}
                  />
                </label>
                <Input
                  id={inputId}
                  size="compact"
                  value={typedText}
                  onChange={(event) => setTypedText(event.target.value)}
                  autoComplete="off"
                />
              </div>
            )}
            <div className="mt-1 flex flex-wrap justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button variant="ghost" size="sm">
                  {t("common.cancel")}
                </Button>
              </AlertDialog.Cancel>
              {hasSecondaryAction && (
                <Button variant="secondary" size="sm" onClick={secondaryAction.onSelect}>
                  {secondaryAction.label}
                </Button>
              )}
              <Button
                type="submit"
                variant={confirmVariant}
                size="sm"
                disabled={!canConfirm}
                isLoading={isConfirming}
              >
                {confirmLabel}
              </Button>
            </div>
          </form>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
