import { DndContext, DragOverlay } from "@dnd-kit/core";
import { horizontalListSortingStrategy, SortableContext } from "@dnd-kit/sortable";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import PlusIcon from "@/assets/icons/linha/mais.svg?react";
import BackIcon from "@/assets/icons/linha/voltar.svg?react";
import type { BoardColumn as BoardColumnData } from "@/bindings";
import { Button } from "@/components/atoms/Button";
import { Skeleton } from "@/components/atoms/Skeleton";
import { EmptyState } from "@/components/molecules/EmptyState";
import { ErrorState } from "@/components/molecules/ErrorState";
import { getErrorMessageKey } from "@/lib/appError";
import { useBoard } from "@/modules/boards/queries";
import { groupTasksByColumn } from "@/modules/tasks/grouping";
import { useBoardTasks } from "@/modules/tasks/queries";
import { BoardColumn } from "@/pages/board/BoardColumn";
import { BoardDeleteDialog } from "@/pages/board/BoardDeleteDialog";
import { BoardHeader } from "@/pages/board/BoardHeader";
import { BoardRenameModal } from "@/pages/board/BoardRenameModal";
import { boardCollisionDetection } from "@/pages/board/boardCollision";
import { ColumnDeleteDialog } from "@/pages/board/ColumnDeleteDialog";
import { ColumnFormModal } from "@/pages/board/ColumnFormModal";
import { TaskCard } from "@/pages/board/TaskCard";
import { useBoardDnd } from "@/pages/board/useBoardDnd";

type ColumnFormState = { column: BoardColumnData | undefined } | null;

const placeholderIds = ["a", "b", "c"];

export function BoardPage() {
  const { t } = useTranslation();
  const { boardId } = useParams({ from: "/boards/$boardId" });
  const navigate = useNavigate();
  const [isDeleted, setIsDeleted] = useState(false);
  const boardQuery = useBoard(boardId, !isDeleted);
  const tasksQuery = useBoardTasks(boardId, !isDeleted);
  const [columnForm, setColumnForm] = useState<ColumnFormState>(null);
  const [columnToDelete, setColumnToDelete] = useState<BoardColumnData | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeletingBoard, setIsDeletingBoard] = useState(false);

  const details = boardQuery.data;
  const columns = details?.columns ?? [];
  const tasksByColumn =
    tasksQuery.data === undefined ? undefined : groupTasksByColumn(tasksQuery.data);
  const haveTasksFailed = tasksQuery.isError;
  const dnd = useBoardDnd({ boardId, columns, tasksByColumn });
  const isLoading = boardQuery.isPending;
  const hasFailed = boardQuery.isError;
  const hasDetails = details !== undefined;
  const hasColumns = columns.length > 0;
  const taskCount = columns.reduce((total, column) => total + column.taskCount, 0);
  const isColumnFormOpen = columnForm !== null;
  const isColumnDeleteOpen = columnToDelete !== null;

  function handleBoardDeleted() {
    setIsDeleted(true);
    const projectId = details?.board.projectId;
    const hasProject = projectId !== undefined;
    if (hasProject) {
      void navigate({ to: "/projects/$projectId", params: { projectId } });
      return;
    }
    void navigate({ to: "/projects" });
  }

  return (
    <>
      {isLoading && (
        <div role="status" aria-busy="true" className="flex flex-col gap-6">
          <span className="sr-only">{t("common.loading")}</span>
          <Skeleton className="h-8 w-1/3" />
          <div className="flex gap-4">
            {placeholderIds.map((id) => (
              <Skeleton key={id} className="h-48 w-75 rounded-xl" />
            ))}
          </div>
        </div>
      )}

      {hasFailed && (
        <>
          <Link
            to="/projects"
            className="inline-flex w-fit items-center gap-1 text-small font-medium text-fg-muted transition-colors hover:text-fg"
          >
            <BackIcon aria-hidden="true" className="size-4" />
            {t("boards.backToProjects")}
          </Link>
          <ErrorState
            title={t("boards.loadError")}
            description={t(getErrorMessageKey(boardQuery.error))}
            onRetry={() => void boardQuery.refetch()}
          />
        </>
      )}

      {hasDetails && (
        <>
          <BoardHeader
            board={details.board}
            columnCount={columns.length}
            taskCount={taskCount}
            onNewColumn={() => setColumnForm({ column: undefined })}
            onRename={() => setIsRenaming(true)}
            onDelete={() => setIsDeletingBoard(true)}
          />

          {haveTasksFailed && (
            <ErrorState
              title={t("boards.tasksLoadError")}
              description={t(getErrorMessageKey(tasksQuery.error))}
              onRetry={() => void tasksQuery.refetch()}
            />
          )}

          {hasColumns ? (
            <DndContext
              sensors={dnd.sensors}
              collisionDetection={boardCollisionDetection}
              {...dnd.handlers}
              accessibility={{
                announcements: dnd.announcements,
                screenReaderInstructions: { draggable: t("boards.dnd.instructions") },
              }}
            >
              <SortableContext
                items={columns.map((column) => column.id)}
                strategy={horizontalListSortingStrategy}
              >
                <ol
                  aria-label={t("boards.columnsLabel")}
                  className="flex items-start gap-4 overflow-x-auto pb-4"
                >
                  {columns.map((column, index) => (
                    <BoardColumn
                      key={column.id}
                      projectId={details.board.projectId}
                      column={column}
                      tasks={
                        tasksByColumn === undefined
                          ? undefined
                          : (tasksByColumn.get(column.id) ?? [])
                      }
                      index={index}
                      total={columns.length}
                      onEdit={(target) => setColumnForm({ column: target })}
                      isDropTarget={dnd.activeTask !== undefined && dnd.overColumnId === column.id}
                      onMoveLeft={(target) => dnd.moveColumnBy(target, -1)}
                      onMoveRight={(target) => dnd.moveColumnBy(target, 1)}
                      onDelete={setColumnToDelete}
                    />
                  ))}
                </ol>
              </SortableContext>
              <DragOverlay>
                {dnd.activeTask !== undefined && (
                  <ul className="rotate-1 shadow-lg">
                    <TaskCard task={dnd.activeTask} />
                  </ul>
                )}
              </DragOverlay>
            </DndContext>
          ) : (
            <EmptyState
              title={t("boards.empty.title")}
              description={t("boards.empty.description")}
              actions={
                <Button
                  size="sm"
                  icon={PlusIcon}
                  onClick={() => setColumnForm({ column: undefined })}
                >
                  {t("boards.newColumn")}
                </Button>
              }
            />
          )}

          {isColumnFormOpen && (
            <ColumnFormModal
              key={columnForm.column?.id ?? "new"}
              boardId={boardId}
              column={columnForm.column}
              onClose={() => setColumnForm(null)}
            />
          )}
          {isColumnDeleteOpen && (
            <ColumnDeleteDialog
              boardId={boardId}
              column={columnToDelete}
              onClose={() => setColumnToDelete(null)}
            />
          )}
          {isRenaming && (
            <BoardRenameModal board={details.board} onClose={() => setIsRenaming(false)} />
          )}
          {isDeletingBoard && (
            <BoardDeleteDialog
              board={details.board}
              onDeleted={handleBoardDeleted}
              onClose={() => setIsDeletingBoard(false)}
            />
          )}
        </>
      )}
    </>
  );
}
