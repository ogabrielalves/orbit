import { useTranslation } from "react-i18next";
import type { ActivityEntry } from "@/bindings";
import { Skeleton } from "@/components/atoms/Skeleton";
import { EmptyState } from "@/components/molecules/EmptyState";
import { ErrorState } from "@/components/molecules/ErrorState";
import { getErrorMessageKey } from "@/lib/appError";
import { formatRelativeTime } from "@/lib/dates";
import { useTaskHistory } from "@/modules/activity/queries";
import { formatActivityMessage } from "@/modules/activity/text";

type TaskHistoryProps = {
  taskId: string;
};

const placeholderIds = ["a", "b", "c"];

function HistoryItem({ entry }: { entry: ActivityEntry }) {
  const { t, i18n } = useTranslation();
  const message = formatActivityMessage(t, entry);
  const changes = Object.entries(entry.changes ?? {});
  const emptyValue = t("tasks.history.emptyValue");

  return (
    <li className="flex gap-3 pb-4 last:pb-0">
      <span
        aria-hidden="true"
        className="mt-1.5 size-2.5 shrink-0 rounded-full border-2 border-border-strong bg-surface"
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-small text-fg">{message}</span>
        {changes.map(([key, change]) => {
          const field = t(`tasks.history.field.${key}`, { defaultValue: key });
          const to = change.to ?? emptyValue;
          const hasFrom = change.from !== null;
          const line = hasFrom
            ? t("tasks.history.changeFrom", { field, from: change.from, to })
            : t("tasks.history.changeSet", { field, to });
          return (
            <span key={key} className="wrap-break-word text-caption text-fg-secondary">
              {line}
            </span>
          );
        })}
        <span className="text-caption text-fg-muted">
          {formatRelativeTime(new Date(entry.createdAt), new Date(), i18n.language)}
        </span>
      </div>
    </li>
  );
}

export function TaskHistory({ taskId }: TaskHistoryProps) {
  const { t } = useTranslation();
  const historyQuery = useTaskHistory(taskId);

  const entries = historyQuery.data ?? [];
  const hasEntries = entries.length > 0;
  const hasNoEntries = historyQuery.isSuccess && !hasEntries;

  return (
    <section aria-label={t("tasks.history.title")} className="flex flex-col gap-2">
      {historyQuery.isPending && (
        <div role="status" aria-busy="true" className="flex flex-col gap-4">
          <span className="sr-only">{t("common.loading")}</span>
          {placeholderIds.map((id) => (
            <Skeleton key={id} className="h-4 w-4/5" />
          ))}
        </div>
      )}
      {historyQuery.isError && (
        <ErrorState
          title={t("tasks.history.loadError")}
          description={t(getErrorMessageKey(historyQuery.error))}
          onRetry={() => void historyQuery.refetch()}
        />
      )}
      {hasNoEntries && (
        <EmptyState
          title={t("tasks.history.empty.title")}
          description={t("tasks.history.empty.description")}
        />
      )}
      {hasEntries && (
        <ol aria-label={t("tasks.history.list")} className="flex flex-col">
          {entries.map((entry) => (
            <HistoryItem key={entry.id} entry={entry} />
          ))}
        </ol>
      )}
    </section>
  );
}
