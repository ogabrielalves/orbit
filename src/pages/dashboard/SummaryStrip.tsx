import { useTranslation } from "react-i18next";
import type { DashboardSummary } from "@/bindings";
import { Skeleton } from "@/components/atoms/Skeleton";
import { ErrorState } from "@/components/molecules/ErrorState";
import { getErrorMessageKey } from "@/lib/appError";
import { useDashboardSummary } from "@/modules/dashboard/queries";

type SummaryStripProps = {
  today: string;
};

type Stat = {
  id: "activeProjects" | "todo" | "inProgress" | "completed" | "overdue";
  value: number;
  isAlert?: boolean;
};

const placeholderIds = ["a", "b", "c", "d", "e"];

function getStats(summary: DashboardSummary): Stat[] {
  return [
    { id: "activeProjects", value: summary.activeProjectCount },
    { id: "todo", value: summary.tasks.backlog + summary.tasks.pending },
    { id: "inProgress", value: summary.tasks.inProgress },
    { id: "completed", value: summary.tasks.completed },
    { id: "overdue", value: summary.overdueTaskCount, isAlert: summary.overdueTaskCount > 0 },
  ];
}

export function SummaryStrip({ today }: SummaryStripProps) {
  const { t } = useTranslation();
  const summaryQuery = useDashboardSummary({ today });

  if (summaryQuery.isError) {
    return (
      <ErrorState
        title={t("dashboard.summary.loadError")}
        description={t(getErrorMessageKey(summaryQuery.error))}
        onRetry={() => void summaryQuery.refetch()}
      />
    );
  }

  if (summaryQuery.isPending) {
    return (
      <div
        role="status"
        aria-busy="true"
        className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5"
      >
        <span className="sr-only">{t("common.loading")}</span>
        {placeholderIds.map((id) => (
          <Skeleton key={id} className="h-20 rounded-2xl" />
        ))}
      </div>
    );
  }

  return (
    <dl className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
      {getStats(summaryQuery.data).map((stat) => (
        <div
          key={stat.id}
          className="flex flex-col gap-1 rounded-2xl border border-border bg-surface px-5 py-4"
        >
          <dt className="text-caption font-medium text-fg-muted">
            {t(`dashboard.summary.${stat.id}`)}
          </dt>
          <dd
            className={`font-display text-heading-2 font-semibold ${stat.isAlert ? "text-danger-fg" : "text-fg"}`}
          >
            {stat.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
