import {
  type Announcements,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { BacklogGroup, BacklogItem } from "@/bindings";
import { Button } from "@/components/atoms/Button";
import { Skeleton } from "@/components/atoms/Skeleton";
import { EmptyState } from "@/components/molecules/EmptyState";
import { ErrorState } from "@/components/molecules/ErrorState";
import { PageHeader } from "@/components/molecules/PageHeader";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { getErrorMessageKey } from "@/lib/appError";
import { getBacklogMove } from "@/modules/backlog/moves";
import { useBacklog, useBacklogByProject, useMoveBacklogTask } from "@/modules/backlog/queries";
import { useProjects } from "@/modules/projects/queries";
import { useTags } from "@/modules/tags/queries";
import { BacklogItemCard, SortableBacklogItemCard } from "@/pages/backlog/BacklogItemCard";
import { BacklogSendModal } from "@/pages/backlog/BacklogSendModal";
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
  const moveBacklogTask = useMoveBacklogTask();
  const [itemToSend, setItemToSend] = useState<BacklogItem | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    }),
  );

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
  const canReorder = !isGrouped && filters.sort === "manual";
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

  function titleOf(id: unknown): string {
    return flatItems.find((entry) => entry.task.id === id)?.task.title ?? "";
  }

  const announcements: Announcements = {
    onDragStart: ({ active }) => t("backlog.dnd.picked", { title: titleOf(active.id) }),
    onDragOver: ({ active, over }) =>
      over === null
        ? undefined
        : t("backlog.dnd.over", { title: titleOf(active.id), over: titleOf(over.id) }),
    onDragEnd: ({ active, over }) =>
      over === null
        ? t("backlog.dnd.cancelled", { title: titleOf(active.id) })
        : t("backlog.dnd.dropped", { title: titleOf(active.id), over: titleOf(over.id) }),
    onDragCancel: ({ active }) => t("backlog.dnd.cancelled", { title: titleOf(active.id) }),
  };

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (over === null) {
      return;
    }
    const move = getBacklogMove(flatItems, String(active.id), String(over.id));
    const hasMove = move !== null;
    if (hasMove) {
      moveBacklogTask.mutate({ id: move.taskId, afterTaskId: move.afterTaskId });
    }
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
        <>
          {canReorder && <p className="text-caption text-fg-muted">{t("backlog.reorderHint")}</p>}
          {canReorder ? (
            <DndContext
              sensors={sensors}
              onDragEnd={handleDragEnd}
              accessibility={{
                announcements,
                screenReaderInstructions: { draggable: t("backlog.dnd.instructions") },
              }}
            >
              <SortableContext
                items={flatItems.map((entry) => entry.task.id)}
                strategy={verticalListSortingStrategy}
              >
                <ul aria-label={t("backlog.listLabel")} className="flex flex-col gap-2">
                  {flatItems.map((item) => (
                    <SortableBacklogItemCard
                      key={item.task.id}
                      item={item}
                      showProject
                      onOpen={() => openTask(item.task.id)}
                      onSend={() => setItemToSend(item)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          ) : (
            <ul aria-label={t("backlog.listLabel")} className="flex flex-col gap-2">
              {flatItems.map((item) => (
                <BacklogItemCard
                  key={item.task.id}
                  item={item}
                  showProject
                  onOpen={() => openTask(item.task.id)}
                  onSend={() => setItemToSend(item)}
                />
              ))}
            </ul>
          )}
        </>
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
                    onSend={() => setItemToSend(item)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {itemToSend !== null && (
        <BacklogSendModal
          key={itemToSend.task.id}
          item={itemToSend}
          onClose={() => setItemToSend(null)}
        />
      )}
      {isTaskOpen && <TaskDrawer key={openTaskId} taskId={openTaskId} onClose={closeTask} />}
    </>
  );
}
