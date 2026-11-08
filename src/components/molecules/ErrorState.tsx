import { useTranslation } from "react-i18next";
import { Button } from "@/components/atoms/Button";

type ErrorStateProps = {
  title: string;
  description?: string;
  onRetry?: () => void;
};

export function ErrorState({ title, description, onRetry }: ErrorStateProps) {
  const { t } = useTranslation();
  const hasDescription = description !== undefined;
  const canRetry = onRetry !== undefined;

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-danger-border bg-danger-soft p-3.5"
    >
      <span
        aria-hidden="true"
        className="flex size-5 shrink-0 items-center justify-center rounded-full bg-danger text-caption font-bold text-fg-on-primary"
      >
        !
      </span>
      <div className="flex flex-col items-start gap-1">
        <span className="text-small font-semibold text-danger-fg">{title}</span>
        {hasDescription && (
          <span className="text-caption text-danger-fg-strong">{description}</span>
        )}
        {canRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry}>
            {t("common.retry")}
          </Button>
        )}
      </div>
    </div>
  );
}
