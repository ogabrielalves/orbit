import type { ComponentProps } from "react";

type TextareaProps = Omit<ComponentProps<"textarea">, "className"> & {
  hasError?: boolean;
};

export function Textarea({ hasError = false, rows = 3, ...rest }: TextareaProps) {
  const borderClass = hasError
    ? "border-danger focus-visible:shadow-focus-input"
    : "border-border-strong focus-visible:border-primary focus-visible:shadow-focus-input";

  return (
    <textarea
      rows={rows}
      aria-invalid={hasError}
      className={`w-full resize-none rounded-md border bg-surface px-3 py-2.5 text-body text-fg placeholder:text-fg-muted disabled:cursor-not-allowed disabled:bg-canvas disabled:text-fg-disabled ${borderClass}`}
      {...rest}
    />
  );
}
