import { type FormEvent, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Board } from "@/bindings";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { FormField } from "@/components/molecules/FormField";
import { Modal } from "@/components/organisms/Modal";
import { BOARD_NAME_MAX_LENGTH } from "@/modules/boards/limits";
import { useUpdateBoard } from "@/modules/boards/queries";

type BoardRenameModalProps = {
  board: Board;
  onClose: () => void;
};

export function BoardRenameModal({ board, onClose }: BoardRenameModalProps) {
  const { t } = useTranslation();
  const formId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const updateBoard = useUpdateBoard();
  const [name, setName] = useState(board.name);

  const isNameBlank = name.trim() === "";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isNameBlank) {
      return;
    }

    updateBoard.mutate(
      { id: board.id, input: { name: name.trim() } },
      {
        onSuccess: () => {
          toast.success(t("boards.toast.boardRenamed"));
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
      title={t("boards.form.renameTitle")}
      closeLabel={t("common.close")}
      initialFocusRef={nameInputRef}
      footer={
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={isNameBlank}
            isLoading={updateBoard.isPending}
          >
            {t("boards.form.columnSave")}
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4.5 p-6">
        <FormField label={t("boards.form.boardNameLabel")}>
          {({ id, "aria-describedby": describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              ref={nameInputRef}
              value={name}
              maxLength={BOARD_NAME_MAX_LENGTH}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </FormField>
      </form>
    </Modal>
  );
}
