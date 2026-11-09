import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { BacklogGroup, BacklogItem } from "@/bindings";
import { Button } from "@/components/atoms/Button";
import { Skeleton } from "@/components/atoms/Skeleton";
import { EmptyState } from "@/components/molecules/EmptyState";
import { ErrorState } from "@/components/molecules/ErrorState";
import { PageHeader } from "@/components/molecules/PageHeader";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { getErrorMessageKey } from "@/lib/appError";
import { useBacklog, useBacklogByProject } from "@/modules/backlog/queries";
import { useProjects } from "@/modules/projects/queries";
import { useTags } from "@/modules/tags/queries";
import { BacklogItemCard } from "@/pages/backlog/BacklogItemCard";
import { BacklogToolbar } from "@/pages/backlog/BacklogToolbar";
import {
  type BacklogSearch,
  buildBacklogInput,
  hasActiveBacklogFilters,
  resolveBacklogFilters,
} from "@/pages/backlog/backlogSearch";
import { TaskDrawer } from "@/pages/task/TaskDrawer";

const SEARCH_DEBOUNCE_IN_MILLISECONDS = 250;
const placeholderIds = ["a", "b", "c", "d"];

export function BacklogPage() {
  const { t } = useTranslation();
  const search = useSearch({ from: "/backlog" });
  const navigate = useNavigate({ from: "/backlog" });

  const filters = resolveBacklogFilters(search);
  const debouncedQuery = useDebouncedValue(filters.q, SEARCH_DEBOUNCE_IN_MILLISECONDS);
  const input = buildBacklogInput({ ...filters, q: debouncedQuery });
  const isGrouped = filters.grouped;

  const flatQuery = useBacklog(input, !isGrouped);
  const groupedQuery = useBacklogByProject(input, isGrouped);
  const activeQuery = isGrouped ? groupedQuery : flatQuery;
  const projectsQuery = useProjects({ scope: "active", status: null, search: null });
  const tagsQuery = useTags();

  const flatItems: BacklogItem[] = flatQuery.data ?? [];
  const groups: BacklogGroup[] = groupedQuery.data ?? [];
  const itemCount = isGrouped
    ? groups.reduce((total, group) => total + group.items.length, 0)
    : flatItems.length;
  const isLoading = activeQuery.isPending;
  const hasFailed = activeQuery.isError;
  const hasLoaded = activeQuery.isSuccess;
  const hasItems = itemCount > 0;
  const hasNoItems = hasLoaded && !hasItems;
  const hasFilters = hasActiveBacklogFilters(filters);
  const openTaskId = search.task;
  const isTaskOpen = openTaskId !== undefined;

  function handleFiltersChange(patch: BacklogSearch) {
    void navigate({ search: (previous) => ({ ...previous, ...patch }), replace: true });
  }

  function handleClearFilters() {
    void navigate({
      search: (previous) => ({
        ...previous,
        q: undefined,
        project: undefined,
        priority: undefined,
        tag: undefined,
      }),
      replace: true,
    });
  }

  function openTask(taskId: string) {
    void navigate({ search: (previous) => ({ ...previous, task: taskId }) });
  }

  function closeTask() {
    void navigate({ search: (previous) => ({ ...previous, task: undefined }), replace: true });
  }

  return (
    <>
      <PageHeader
        title={t("nav.backlog")}
        subtitle={hasLoaded ? t("backlog.count", { count: itemCount }) : undefined}
      />
      <BacklogToolbar
        filters={filters}
        projects={projectsQuery.data ?? []}
        tags={tagsQuery.data ?? []}
        onChange={handleFiltersChange}
      />
      {isLoading && (
        <div role="status" aria-busy="true" className="flex flex-col gap-2">
          <span className="sr-only">{t("common.loading")}</span>
          {placeholderIds.map((id) => (
            <Skeleton key={id} className="h-20 w-full" />
          ))}
        </div>
      )}
      {hasFailed && (
        <ErrorState
          title={t("backlog.loadError")}
          description={t(getErrorMessageKey(activeQuery.error))}
          onRetry={() => void activeQuery.refetch()}
        />
      )}
      {hasNoItems && hasFilters && (
        <EmptyState
          title={t("backlog.noResults.title")}
          description={t("backlog.noResults.description")}
          actions={
            <Button variant="secondary" size="sm" onClick={handleClearFilters}>
              {t("backlog.noResults.clearFilters")}
            </Button>
          }
        />
      )}
      {hasNoItems && !hasFilters && (
        <EmptyState title={t("backlog.empty.title")} description={t("backlog.empty.description")} />
      )}
      {hasItems && !isGrouped && (
        <ul aria-label={t("backlog.listLabel")} className="flex flex-col gap-2">
          {flatItems.map((item) => (
            <BacklogItemCard
              key={item.task.id}
              item={item}
              showProject
              onOpen={() => openTask(item.task.id)}
            />
          ))}
        </ul>
      )}
      {hasItems && isGrouped && (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={group.projectId} aria-label={group.projectName}>
              <h2 className="mb-2 font-display text-heading-3 font-semibold text-fg">
                {group.projectName}
              </h2>
              <ul className="flex flex-col gap-2">
                {group.items.map((item) => (
                  <BacklogItemCard
                    key={item.task.id}
                    item={item}
                    showProject={false}
                    onOpen={() => openTask(item.task.id)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {isTaskOpen && <TaskDrawer key={openTaskId} taskId={openTaskId} onClose={closeTask} />}
    </>
  );
}
