import { type FormEvent, type KeyboardEvent, useId, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { NewColumn } from "@/bindings";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { FormField } from "@/components/molecules/FormField";
import { Modal } from "@/components/organisms/Modal";
import { matchesHotkey } from "@/lib/hotkey";

const NAME_MAX_LENGTH = 120;

export type BoardTemplateOption = {
  id: string;
  label: string;
  description: string;
  columns: NewColumn[];
};

export type BoardFormValues = {
  name: string;
  columns: NewColumn[];
};

type BoardFormModalProps = {
  templates: BoardTemplateOption[];
  defaultTemplateId: string;
  isSubmitting: boolean;
  onSubmit: (values: BoardFormValues) => Promise<void>;
  onOpenChange: (isOpen: boolean) => void;
};

function keepOpenOnFailure(): undefined {
  return undefined;
}

export function BoardFormModal({
  templates,
  defaultTemplateId,
  isSubmitting,
  onSubmit,
  onOpenChange,
}: BoardFormModalProps) {
  const { t } = useTranslation();
  const formId = useId();
  const templateGroupName = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState(defaultTemplateId);

  const isNameBlank = name.trim() === "";
  const selectedTemplate = templates.find((template) => template.id === templateId);
  const previewColumns = selectedTemplate?.columns ?? [];
  const hasPreviewColumns = previewColumns.length > 0;

  function handleClose() {
    onOpenChange(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isNameBlank) {
      return;
    }

    onSubmit({ name: name.trim(), columns: previewColumns }).catch(keepOpenOnFailure);
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
      onClose={handleClose}
      size="sm"
      title={t("boards.form.boardCreateTitle")}
      closeLabel={t("common.close")}
      initialFocusRef={nameInputRef}
      footer={
        <>
          <span className="hidden text-caption text-fg-muted md:block">
            <Trans
              i18nKey="projects.form.shortcutHint"
              components={{
                key: (
                  <kbd className="rounded-xs border border-border bg-surface-muted px-1.5 py-px font-sans text-micro text-fg-secondary" />
                ),
              }}
            />
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={handleClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" form={formId} disabled={isNameBlank} isLoading={isSubmitting}>
              {t("boards.form.boardCreate")}
            </Button>
          </div>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={handleSubmit}
        onKeyDown={handleKeyDown}
        className="flex flex-col gap-4.5 p-6"
      >
        <FormField label={t("boards.form.boardNameLabel")}>
          {({ id, "aria-describedby": describedBy }) => (
            <Input
              id={id}
              aria-describedby={describedBy}
              ref={nameInputRef}
              value={name}
              maxLength={NAME_MAX_LENGTH}
              placeholder={t("boards.form.boardNamePlaceholder")}
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </FormField>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-small font-medium text-fg">
            {t("boards.form.templateLabel")}
          </legend>
          {templates.map((template) => (
            <label
              key={template.id}
              className="flex cursor-pointer items-start gap-3 rounded-md border border-border px-3 py-2.5 transition-colors has-checked:border-primary has-checked:bg-primary-soft has-focus-visible:shadow-focus"
            >
              <input
                type="radio"
                name={templateGroupName}
                value={template.id}
                checked={template.id === templateId}
                onChange={() => setTemplateId(template.id)}
                className="mt-1 accent-primary"
              />
              <span className="flex flex-col">
                <span className="text-small font-medium text-fg">{template.label}</span>
                <span className="text-caption text-fg-muted">{template.description}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="flex flex-col gap-2">
          <span className="text-small font-medium text-fg">
            {t("boards.form.columnsPreviewLabel")}
          </span>
          {hasPreviewColumns ? (
            <ul className="flex flex-wrap gap-1.5">
              {previewColumns.map((column) => (
                <li
                  key={column.name}
                  className="rounded-xs bg-surface-muted px-2 py-0.75 text-caption font-medium text-fg-secondary"
                >
                  {column.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-caption text-fg-muted">{t("boards.form.columnsPreviewEmpty")}</p>
          )}
        </div>
      </form>
    </Modal>
  );
}
