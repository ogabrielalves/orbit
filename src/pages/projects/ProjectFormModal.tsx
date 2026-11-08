import { type FormEvent, type KeyboardEvent, useId, useRef, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Project, ProjectStatus } from "@/bindings";
import { Button } from "@/components/atoms/Button";
import { Input } from "@/components/atoms/Input";
import { ProjectTile } from "@/components/atoms/ProjectTile";
import { Select } from "@/components/atoms/Select";
import { Textarea } from "@/components/atoms/Textarea";
import { FormField } from "@/components/molecules/FormField";
import { Modal } from "@/components/organisms/Modal";
import { matchesHotkey } from "@/lib/hotkey";
import {
  defaultProjectColorKey,
  type ProjectColorKey,
  projectColorKeys,
  resolveProjectColor,
} from "@/modules/projects/colors";
import { useCreateProject, useUpdateProject } from "@/modules/projects/queries";
import { ProjectColorPicker } from "@/pages/projects/ProjectColorPicker";

const NAME_MAX_LENGTH = 120;

const projectStatuses: ProjectStatus[] = ["active", "paused", "completed"];

type ProjectFormModalProps = {
  project?: Project;
  onClose: () => void;
  onSaved?: (project: Project) => void;
};

function pickInitialColor(color: string | null): ProjectColorKey {
  const savedColor = projectColorKeys.find((key) => key === color);
  return savedColor ?? defaultProjectColorKey;
}

export function ProjectFormModal({ project, onClose, onSaved }: ProjectFormModalProps) {
  const { t } = useTranslation();
  const formId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();

  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [color, setColor] = useState(pickInitialColor(project?.color ?? null));
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "active");

  const isEditing = project !== undefined;
  const isSaving = createProject.isPending || updateProject.isPending;
  const isNameBlank = name.trim() === "";
  const hasDescription = description.trim() !== "";
  const previewName = isNameBlank ? t("projects.form.previewPlaceholder") : name.trim();
  const titleKey = isEditing ? "projects.form.editTitle" : "projects.form.createTitle";
  const submitKey = isEditing ? "projects.form.save" : "projects.form.create";
  const toastKey = isEditing ? "projects.toast.updated" : "projects.toast.created";

  function handleSaved(saved: Project) {
    toast.success(t(toastKey));
    onSaved?.(saved);
    onClose();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isNameBlank) {
      return;
    }

    const input = { name: name.trim(), description: description.trim(), color };
    if (isEditing) {
      updateProject.mutate(
        { id: project.id, input: { ...input, status } },
        { onSuccess: handleSaved },
      );
      return;
    }
    createProject.mutate(input, { onSuccess: handleSaved });
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
                key: (
                  <kbd className="rounded-xs border border-border bg-surface-muted px-1.5 py-px font-sans text-micro text-fg-secondary" />
                ),
              }}
            />
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" form={formId} disabled={isNameBlank} isLoading={isSaving}>
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
            <ProjectColorPicker
              label={t("projects.form.colorLabel")}
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
              <ProjectTile name={previewName} color={resolveProjectColor(color)} size="md" />
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
