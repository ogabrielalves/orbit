import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { TaskPriority } from "@/bindings";
import { Badge } from "@/components/atoms/Badge";
import { Skeleton } from "@/components/atoms/Skeleton";
import { EmptyState } from "@/components/molecules/EmptyState";
import { ErrorState } from "@/components/molecules/ErrorState";
import { getErrorMessageKey } from "@/lib/appError";
import { formatDueDate } from "@/lib/dates";
import { useDashboardSummary } from "@/modules/dashboard/queries";
import { DashboardCard } from "@/pages/dashboard/DashboardCard";

type UpcomingDeadlinesCardProps = {
  today: string;
  now: Date;
};

const placeholderIds = ["a", "b", "c"];

const priorityTones: Record<TaskPriority, "neutral" | "info" | "warning" | "danger"> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  urgent: "danger",
};

export function UpcomingDeadlinesCard({ today, now }: UpcomingDeadlinesCardProps) {
  const { t, i18n } = useTranslation();
  const summaryQuery = useDashboardSummary({ today });

  const tasks = summaryQuery.data?.upcomingTasks ?? [];
  const isLoading = summaryQuery.isPending;
  const hasFailed = summaryQuery.isError;
  const hasTasks = tasks.length > 0;
  const hasNoTasks = summaryQuery.isSuccess && !hasTasks;

  return (
    <DashboardCard title={t("dashboard.upcoming.title")}>
      {isLoading && (
        <div role="status" aria-busy="true" className="flex flex-col gap-3">
          <span className="sr-only">{t("common.loading")}</span>
          {placeholderIds.map((id) => (
            <Skeleton key={id} className="h-3.5 w-full" />
          ))}
        </div>
      )}
      {hasFailed && (
        <ErrorState
          title={t("dashboard.upcoming.loadError")}
          description={t(getErrorMessageKey(summaryQuery.error))}
          onRetry={() => void summaryQuery.refetch()}
        />
      )}
      {hasNoTasks && (
        <EmptyState
          title={t("dashboard.upcoming.empty.title")}
          description={t("dashboard.upcoming.empty.description")}
        />
      )}
      {hasTasks && (
        <ul className="flex flex-col">
          {tasks.map((task) => (
            <li key={task.taskId}>
              <Link
                {...(task.boardId
                  ? { to: "/boards/$boardId", params: { boardId: task.boardId } }
                  : { to: "/projects/$projectId", params: { projectId: task.projectId } })}
                className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-surface-muted"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body font-medium text-fg">{task.title}</span>
                  <span className="truncate text-caption text-fg-muted">{task.projectName}</span>
                </span>
                <Badge tone={priorityTones[task.priority]}>
                  {t(`dashboard.upcoming.priority.${task.priority}`)}
                </Badge>
                <span className="shrink-0 text-caption text-fg-muted">
                  {formatDueDate(task.dueDate, now, i18n.language)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}
