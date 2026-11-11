import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/atoms/Skeleton";
import { EmptyState } from "@/components/molecules/EmptyState";
import { ErrorState } from "@/components/molecules/ErrorState";
import { getErrorMessageKey } from "@/lib/appError";
import { formatRelativeTime } from "@/lib/dates";
import { useRecentNotes } from "@/modules/notes/recentQueries";
import { DashboardCard } from "@/pages/dashboard/DashboardCard";

const VISIBLE_NOTES = 5;
const placeholderIds = ["a", "b", "c"];

export function RecentNotesCard() {
  const { t, i18n } = useTranslation();
  const notesQuery = useRecentNotes(VISIBLE_NOTES);

  const notes = notesQuery.data ?? [];
  const isLoading = notesQuery.isPending;
  const hasFailed = notesQuery.isError;
  const hasLoaded = notesQuery.isSuccess;
  const hasNotes = notes.length > 0;
  const hasNoNotes = hasLoaded && !hasNotes;

  return (
    <DashboardCard
      title={t("dashboard.recentNotes.title")}
      action={
        <Link to="/notes" className="text-primary hover:text-primary-hover">
          {t("dashboard.recentNotes.viewAll")}
        </Link>
      }
    >
      {isLoading && (
        <div role="status" aria-busy="true" className="flex flex-col gap-4">
          <span className="sr-only">{t("common.loading")}</span>
          {placeholderIds.map((id) => (
            <div key={id} className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-2/5" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ))}
        </div>
      )}
      {hasFailed && (
        <ErrorState
          title={t("dashboard.recentNotes.loadError")}
          description={t(getErrorMessageKey(notesQuery.error))}
          onRetry={() => void notesQuery.refetch()}
        />
      )}
      {hasNoNotes && (
        <EmptyState
          title={t("dashboard.recentNotes.empty.title")}
          description={t("dashboard.recentNotes.empty.description")}
        />
      )}
      {hasNotes && (
        <ul className="flex flex-col">
          {notes.map((note) => {
            const hasExcerpt = note.excerpt.trim() !== "";

            return (
              <li key={note.id}>
                <Link
                  to="/notes/$noteId"
                  params={{ noteId: note.id }}
                  className="-mx-2 flex flex-col gap-0.5 rounded-md px-2 py-2.5 transition-colors hover:bg-surface-muted"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 flex-1 truncate text-body font-medium text-fg">
                      {note.title}
                    </span>
                    <span className="shrink-0 text-caption text-fg-muted">
                      {formatRelativeTime(new Date(note.modifiedAt), new Date(), i18n.language)}
                    </span>
                  </span>
                  {hasExcerpt && (
                    <span className="truncate text-small text-fg-secondary">{note.excerpt}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </DashboardCard>
  );
}
