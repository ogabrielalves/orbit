import { type FormEvent, type KeyboardEvent, useId, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { ProjectStatus } from "@/bindings";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { Kbd } from "@/components/atoms/Kbd";
import { ProjectTile } from "@/components/atoms/ProjectTile";
import { Select } from "@/components/atoms/Select";
import { Textarea } from "@/components/atoms/Textarea";
import { type ColorOption, ColorPicker } from "@/components/molecules/ColorPicker";
import { FormField } from "@/components/molecules/FormField";
import { Modal } from "@/components/organisms/Modal";
import { matchesHotkey } from "@/lib/hotkey";

const NAME_MAX_LENGTH = 120;

const projectStatuses: ProjectStatus[] = ["active", "paused", "completed"];

export type ProjectFormValues = {
  name: string;
  description: string;
  color: string;
  status: ProjectStatus;
};

type ProjectFormModalProps = {
  mode: "create" | "edit";
  initialValues: ProjectFormValues;
  colorOptions: ColorOption<string>[];
  isSubmitting: boolean;
  onSubmit: (values: ProjectFormValues) => Promise<void>;
  onOpenChange: (isOpen: boolean) => void;
};

function keepOpenOnFailure(): undefined {
  return undefined;
}

export function ProjectFormModal({
  mode,
  initialValues,
  colorOptions,
  isSubmitting,
  onSubmit,
  onOpenChange,
}: ProjectFormModalProps) {
  const { t } = useTranslation();
  const formId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(initialValues.name);
  const [description, setDescription] = useState(initialValues.description);
  const [color, setColor] = useState(initialValues.color);
  const [status, setStatus] = useState(initialValues.status);

  const isEditing = mode === "edit";
  const isNameBlank = name.trim() === "";
  const hasDescription = description.trim() !== "";
  const previewName = isNameBlank ? t("projects.form.previewPlaceholder") : name.trim();
  const previewColor = colorOptions.find((option) => option.value === color)?.color ?? "";
  const titleKey = isEditing ? "projects.form.editTitle" : "projects.form.createTitle";
  const submitKey = isEditing ? "projects.form.save" : "projects.form.create";

  function handleClose() {
    onOpenChange(false);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isNameBlank) {
      return;
    }

    onSubmit({ name: name.trim(), description: description.trim(), color, status }).catch(
      keepOpenOnFailure,
    );
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
      title={t(titleKey)}
      description={t("projects.form.subtitle")}
      closeLabel={t("common.close")}
      initialFocusRef={nameInputRef}
      footer={
        <>
          <span className="hidden text-caption text-fg-muted md:block">
            <Trans
              i18nKey="projects.form.shortcutHint"
              components={{
                key: <Kbd />,
              }}
            />
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={handleClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" form={formId} disabled={isNameBlank} isLoading={isSubmitting}>
              {t(submitKey)}
            </Button>
          </div>
        </>
      }
    >
      <div className="grid md:grid-cols-[minmax(0,1fr)_18.75rem]">
        <form
          id={formId}
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
          className="flex flex-col gap-4.5 p-6"
        >
          <FormField label={t("projects.form.nameLabel")}>
            {({ id, "aria-describedby": describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                ref={nameInputRef}
                value={name}
                maxLength={NAME_MAX_LENGTH}
                placeholder={t("projects.form.namePlaceholder")}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </FormField>
          <FormField label={t("projects.form.descriptionLabel")} isOptional>
            {({ id, "aria-describedby": describedBy }) => (
              <Textarea
                id={id}
                aria-describedby={describedBy}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            )}
          </FormField>
          <div className="flex flex-col gap-2">
            <span className="text-small font-medium text-fg">{t("projects.form.colorLabel")}</span>
            <ColorPicker
              label={t("projects.form.colorLabel")}
              options={colorOptions}
              value={color}
              onChange={setColor}
            />
          </div>
          {isEditing && (
            <FormField label={t("projects.form.statusLabel")}>
              {({ id, "aria-describedby": describedBy }) => (
                <Select
                  id={id}
                  aria-describedby={describedBy}
                  value={status}
                  onChange={(event) => setStatus(event.target.value as ProjectStatus)}
                >
                  {projectStatuses.map((option) => (
                    <option key={option} value={option}>
                      {t(`projects.statusName.${option}`)}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
          )}
        </form>
        <aside className="flex flex-col gap-3 border-t border-border bg-canvas p-6 md:border-t-0 md:border-l">
          <span className="text-caption font-semibold tracking-wider text-fg-muted uppercase">
            {t("projects.form.previewLabel")}
          </span>
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center gap-2.5">
              <ProjectTile name={previewName} color={previewColor} size="md" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-body font-semibold text-fg">{previewName}</span>
                <span className="text-caption text-success-fg">
                  {t(`projects.statusName.${status}`)}
                </span>
              </div>
            </div>
            {hasDescription && (
              <p className="line-clamp-3 text-caption text-fg-secondary">{description.trim()}</p>
            )}
          </div>
        </aside>
      </div>
    </Modal>
  );
}
