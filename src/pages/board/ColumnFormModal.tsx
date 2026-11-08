import { type FormEvent, type KeyboardEvent, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { BoardColumn } from "@/bindings";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { type ColorOption, ColorPicker } from "@/components/molecules/ColorPicker";
import { FormField } from "@/components/molecules/FormField";
import { Modal } from "@/components/organisms/Modal";
import { matchesHotkey } from "@/lib/hotkey";
import { COLUMN_NAME_MAX_LENGTH } from "@/modules/boards/limits";
import { useCreateColumn, useUpdateColumn } from "@/modules/boards/queries";
import {
  type ProjectColorKey,
  projectColorKeys,
  resolveProjectColor,
} from "@/modules/projects/colors";

const NO_COLOR = "none";

type ColumnColorValue = ProjectColorKey | typeof NO_COLOR;

type ColumnFormModalProps = {
  boardId: string;
  column?: BoardColumn;
  onClose: () => void;
};

function pickInitialColor(color: string | null): ColumnColorValue {
  const savedColor = projectColorKeys.find((key) => key === color);
  return savedColor ?? NO_COLOR;
}

export function ColumnFormModal({ boardId, column, onClose }: ColumnFormModalProps) {
  const { t } = useTranslation();
  const formId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const createColumn = useCreateColumn(boardId);
  const updateColumn = useUpdateColumn(boardId);

  const [name, setName] = useState(column?.name ?? "");
  const [color, setColor] = useState<ColumnColorValue>(pickInitialColor(column?.color ?? null));

  const isEditing = column !== undefined;
  const isSaving = createColumn.isPending || updateColumn.isPending;
  const isNameBlank = name.trim() === "";
  const hasColor = color !== NO_COLOR;
  const savedColor = hasColor ? color : null;
  const titleKey = isEditing ? "boards.form.columnEditTitle" : "boards.form.columnCreateTitle";
  const submitKey = isEditing ? "boards.form.columnSave" : "boards.form.columnCreate";
  const toastKey = isEditing ? "boards.toast.columnUpdated" : "boards.toast.columnCreated";

  const colorOptions: ColorOption<ColumnColorValue>[] = [
    { value: NO_COLOR, label: t("boards.column.noColor"), color: "var(--color-fg-subtle)" },
    ...projectColorKeys.map((key) => ({
      value: key,
      label: t(`projects.colors.${key}`),
      color: resolveProjectColor(key),
    })),
  ];

  function handleSaved() {
    toast.success(t(toastKey));
    onClose();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isNameBlank) {
      return;
    }

    const trimmedName = name.trim();
    if (isEditing) {
      updateColumn.mutate(
        { id: column.id, input: { name: trimmedName, color: savedColor } },
        { onSuccess: handleSaved },
      );
      return;
    }
    createColumn.mutate({ name: trimmedName, color: savedColor }, { onSuccess: handleSaved });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLFormElement>) {
    const isSubmitShortcut = matchesHotkey("mod+enter", event);
    if (isSubmitShortcut) {
      event.preventDefault();
      event.currentTarget.requestSubmit();
    }
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="sm"
      title={t(titleKey)}
      closeLabel={t("common.close")}
      initialFocusRef={nameInputRef}
      footer={
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form={formId} disabled={isNameBlank} isLoading={isSaving}>
            {t(submitKey)}
          </Button>
        </div>
      }
    >
      <form
        id={formId}
        onSubmit={handleSubmit}
        onKeyDown={handleKeyDown}
        className="flex flex-col gap-4.5 p-6"
      >
        <FormField label={t("boards.form.columnNameLabel")}>
          {({ id, "aria-describedby": describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              ref={nameInputRef}
              value={name}
              maxLength={COLUMN_NAME_MAX_LENGTH}
              placeholder={t("boards.form.columnNamePlaceholder")}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </FormField>
        <div className="flex flex-col gap-2">
          <span className="text-small font-medium text-fg">
            {t("boards.form.columnColorLabel")}
          </span>
          <ColorPicker
            label={t("boards.form.columnColorLabel")}
            options={colorOptions}
            value={color}
            onChange={setColor}
          />
        </div>
      </form>
    </Modal>
  );
}
