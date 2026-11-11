import { useTranslation } from "react-i18next";
import type { CheckState } from "@/bindings";
import { Badge } from "@/components/atoms/Badge";
import { Skeleton } from "@/components/atoms/Skeleton";
import { ErrorState } from "@/components/molecules/ErrorState";
import { getErrorMessageKey } from "@/lib/appError";
import { formatRelativeTime } from "@/lib/dates";
import { useDatabaseStatus } from "@/modules/integrity/queries";
import { SettingsSection } from "@/pages/settings/SettingsSection";

const stateTones = {
  pending: "neutral",
  healthy: "success",
  problems: "danger",
  failed: "warning",
} as const satisfies Record<CheckState, "neutral" | "success" | "danger" | "warning">;

export function DatabaseSection() {
  const { t, i18n } = useTranslation();
  const statusQuery = useDatabaseStatus();
  const status = statusQuery.data;

  const isLoading = statusQuery.isPending;
  const hasFailed = statusQuery.isError;
  const hasIssues = status !== undefined && status.integrityIssues.length > 0;
  const hasViolations = status !== undefined && status.foreignKeyViolations > 0;
  const checkedAt = status?.checkedAt ?? null;
  const wasChecked = checkedAt !== null;

  return (
    <SettingsSection
      title={t("settings.database.title")}
      description={t("settings.database.description")}
    >
      {isLoading && (
        <div role="status" aria-busy="true">
          <span className="sr-only">{t("common.loading")}</span>
          <Skeleton className="h-6 w-40" />
        </div>
      )}
      {hasFailed && (
        <ErrorState
          title={t("settings.database.loadError")}
          description={t(getErrorMessageKey(statusQuery.error))}
          onRetry={() => void statusQuery.refetch()}
        />
      )}
      {status !== undefined && (
        <div className="flex flex-col items-start gap-2">
          <Badge tone={stateTones[status.state]} shape="pill" hasDot>
            {t(`settings.database.state.${status.state}`)}
          </Badge>
          {hasIssues && (
            <span className="text-small text-fg-secondary">
              {t("settings.database.issues", { count: status.integrityIssues.length })}
            </span>
          )}
          {hasViolations && (
            <span className="text-small text-fg-secondary">
              {t("settings.database.violations", { count: status.foreignKeyViolations })}
            </span>
          )}
          {wasChecked && (
            <span className="text-caption text-fg-muted">
              {t("settings.database.checkedAt", {
                when: formatRelativeTime(new Date(checkedAt), new Date(), i18n.language),
              })}
            </span>
          )}
        </div>
      )}
    </SettingsSection>
  );
}
