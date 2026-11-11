import { useTranslation } from "react-i18next";
import { Button } from "@/components/atoms/Button";
import { Skeleton } from "@/components/atoms/Skeleton";

type QueryStatusProps = {
  isPending: boolean;
  isError: boolean;
  errorTitle: string;
  onRetry: () => void;
  rows?: 1 | 2;
};

export function QueryStatus({
  isPending,
  isError,
  errorTitle,
  onRetry,
  rows = 1,
}: QueryStatusProps) {
  const { t } = useTranslation();

  if (isError) {
    return (
      <div
        role="alert"
        className="flex items-center justify-between gap-3 rounded-md border border-danger-border bg-danger-soft px-3 py-2"
      >
        <span className="text-small text-danger-fg">{errorTitle}</span>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      </div>
    );
  }

  if (isPending) {
    return (
      <div role="status" aria-busy="true" className="flex flex-col gap-2">
        <span className="sr-only">{t("common.loading")}</span>
        <Skeleton className="h-4 w-2/3" />
        {rows === 2 && <Skeleton className="h-4 w-1/2" />}
      </div>
    );
  }

  return null;
}
