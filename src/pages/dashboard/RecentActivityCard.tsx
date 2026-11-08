import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { ActivityAction } from "@/bindings";
import { Skeleton } from "@/components/atoms/Skeleton";
import { EmptyState } from "@/components/molecules/EmptyState";
import { ErrorState } from "@/components/molecules/ErrorState";
import { getErrorMessageKey } from "@/lib/appError";
import { formatRelativeTime } from "@/lib/dates";
import { useRecentActivity } from "@/modules/activity/queries";
import { formatActivityMessage, getActivityTarget } from "@/modules/activity/text";
import { DashboardCard } from "@/pages/dashboard/DashboardCard";

const VISIBLE_ENTRIES = 10;
const placeholderIds = ["a", "b", "c", "d"];

const dotClasses: Record<ActivityAction, string> = {
  created: "border-primary",
  updated: "border-border-strong",
  deleted: "border-danger",
  archived: "border-warning",
  restored: "border-primary",
  moved: "border-border-strong",
  completed: "border-success",
  reopened: "border-border-strong",
  duplicated: "border-primary",
};

export function RecentActivityCard() {
  const { t, i18n } = useTranslation();
  const activityQuery = useRecentActivity(VISIBLE_ENTRIES);

  const entries = activityQuery.data ?? [];
  const isLoading = activityQuery.isPending;
  const hasFailed = activityQuery.isError;
  const hasLoaded = activityQuery.isSuccess;
  const hasEntries = entries.length > 0;
  const hasNoEntries = hasLoaded && !hasEntries;

  return (
    <DashboardCard title={t("activity.title")}>
      {isLoading && (
        <div role="status" aria-busy="true" className="flex flex-col gap-4">
          <span className="sr-only">{t("common.loading")}</span>
          {placeholderIds.map((id) => (
            <div key={id} className="flex gap-3">
              <Skeleton className="mt-1 size-2.5 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3.5 w-4/5" />
                <Skeleton className="h-3 w-1/4" />
              </div>
            </div>
          ))}
        </div>
      )}
      {hasFailed && (
        <ErrorState
          title={t("activity.loadError")}
          description={t(getErrorMessageKey(activityQuery.error))}
          onRetry={() => void activityQuery.refetch()}
        />
      )}
      {hasNoEntries && (
        <EmptyState
          title={t("activity.empty.title")}
          description={t("activity.empty.description")}
        />
      )}
      {hasEntries && (
        <ol className="flex flex-col">
          {entries.map((entry) => {
            const message = formatActivityMessage(t, entry);
            const target = getActivityTarget(entry);
            const hasTarget = target !== null;

            return (
              <li key={entry.id} className="flex gap-3 pb-4 last:pb-0">
                <span
                  aria-hidden="true"
                  className={`mt-1.5 size-2.5 shrink-0 rounded-full border-2 bg-surface ${dotClasses[entry.action]}`}
                />
                <div className="flex min-w-0 flex-col gap-0.5">
                  {hasTarget ? (
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: target.projectId }}
                      className="text-small text-fg hover:text-primary"
                    >
                      {message}
                    </Link>
                  ) : (
                    <span className="text-small text-fg">{message}</span>
                  )}
                  <span className="text-caption text-fg-muted">
                    {formatRelativeTime(new Date(entry.createdAt), new Date(), i18n.language)}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </DashboardCard>
  );
}
