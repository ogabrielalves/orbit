import { type ReactNode, useId } from "react";
import { useTranslation } from "react-i18next";

type FormFieldControlProps = {
  id: string;
  "aria-describedby": string | undefined;
  hasError: boolean;
};

type FormFieldProps = {
  label: string;
  error?: string;
  hint?: string;
  isOptional?: boolean;
  children: (controlProps: FormFieldControlProps) => ReactNode;
};

export function FormField({ label, error, hint, isOptional = false, children }: FormFieldProps) {
  const { t } = useTranslation();
  const id = useId();
  const messageId = `${id}-message`;

  const hasError = error !== undefined;
  const hasHint = hint !== undefined;
  const hasMessage = hasError || hasHint;
  const message = error ?? hint;
  const messageClass = hasError ? "text-danger-fg" : "text-fg-muted";

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-small font-medium text-fg">
        {label}
        {isOptional && (
          <span className="ml-1 font-normal text-fg-muted">({t("common.optional")})</span>
        )}
      </label>
      {children({
        id,
        "aria-describedby": hasMessage ? messageId : undefined,
        hasError,
      })}
      {hasMessage && (
        <span id={messageId} className={`text-caption ${messageClass}`}>
          {message}
        </span>
      )}
    </div>
  );
}
