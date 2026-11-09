import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { BacklogItem } from "@/bindings";
import { Button } from "@/components/atoms/Button";
import { Select } from "@/components/atoms/Select";
import { Skeleton } from "@/components/atoms/Skeleton";
import { FormField } from "@/components/molecules/FormField";
import { Modal } from "@/components/organisms/Modal";
import { useBoard } from "@/modules/boards/queries";
import { useProject } from "@/modules/projects/queries";
import { useSendTaskToBoard } from "@/modules/tasks/queries";

type BacklogSendModalProps = {
  item: BacklogItem;
  onClose: () => void;
};

export function BacklogSendModal({ item, onClose }: BacklogSendModalProps) {
  const { t } = useTranslation();
  const formId = useId();
  const { task } = item;
  const projectQuery = useProject(task.projectId);
  const sendTask = useSendTaskToBoard();
  const [chosenBoardId, setChosenBoardId] = useState("");
  const [chosenColumnId, setChosenColumnId] = useState("");

  const boards = projectQuery.data?.boards ?? [];
  const boardId = chosenBoardId !== "" ? chosenBoardId : (boards[0]?.id ?? "");
  const hasBoard = boardId !== "";
  const boardQuery = useBoard(boardId, hasBoard);
  const columns = boardQuery.data?.columns ?? [];
  const columnId = columns.some((column) => column.id === chosenColumnId)
    ? chosenColumnId
    : (columns[0]?.id ?? "");

  const isLoading = projectQuery.isPending || (hasBoard && boardQuery.isPending);
  const hasNoBoards = projectQuery.isSuccess && boards.length === 0;
  const canSend = hasBoard && columnId !== "";

  function handleBoardChange(nextBoardId: string) {
    setChosenBoardId(nextBoardId);
    setChosenColumnId("");
  }

  function handleSubmit(event: { preventDefault: () => void }) {
    event.preventDefault();
    if (!canSend) {
      return;
    }
    const boardName = boards.find((board) => board.id === boardId)?.name ?? "";
    sendTask.mutate(
      { id: task.id, boardId, columnId },
      {
        onSuccess: () => {
          toast.success(t("backlog.send.toast", { board: boardName }));
          onClose();
        },
      },
    );
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="sm"
      title={t("backlog.send.title", { title: task.title })}
      closeLabel={t("common.close")}
      footer={
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form={formId} disabled={!canSend} isLoading={sendTask.isPending}>
            {t("backlog.send.confirm")}
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4.5 p-6">
        {isLoading && (
          <div role="status" aria-busy="true" className="flex flex-col gap-3">
            <span className="sr-only">{t("common.loading")}</span>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        )}
        {hasNoBoards && <p className="text-small text-fg-muted">{t("backlog.send.noBoards")}</p>}
        {!isLoading && !hasNoBoards && (
          <>
            <FormField label={t("backlog.send.boardLabel")}>
              {({ id }) => (
                <Select
                  id={id}
                  value={boardId}
                  onChange={(event) => handleBoardChange(event.target.value)}
                >
                  {boards.map((board) => (
                    <option key={board.id} value={board.id}>
                      {board.name}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <FormField label={t("backlog.send.columnLabel")}>
              {({ id }) => (
                <Select
                  id={id}
                  value={columnId}
                  onChange={(event) => setChosenColumnId(event.target.value)}
                >
                  {columns.map((column) => (
                    <option key={column.id} value={column.id}>
                      {column.name}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
          </>
        )}
      </form>
    </Modal>
  );
}
