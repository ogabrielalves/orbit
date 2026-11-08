import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Project } from "@/bindings";
import { ConfirmDialog } from "@/components/organisms/ConfirmDialog";
import { useArchiveProject, useDeleteProject, useRestoreProject } from "@/modules/projects/queries";

export type ProjectConfirmKind = "archive" | "restore" | "delete";

type ProjectConfirmDialogProps = {
  kind: ProjectConfirmKind;
  project: Project;
  onClose: () => void;
  onDone?: () => void;
};

export function ProjectConfirmDialog({
  kind,
  project,
  onClose,
  onDone,
}: ProjectConfirmDialogProps) {
  const { t } = useTranslation();
  const archiveProject = useArchiveProject();
  const restoreProject = useRestoreProject();
  const deleteProject = useDeleteProject();

  const isArchive = kind === "archive";
  const isRestore = kind === "restore";
  const isDelete = kind === "delete";
  const isArchived = project.archivedAt !== null;
  const canArchiveInstead = isDelete && !isArchived;
  const isConfirming =
    archiveProject.isPending || restoreProject.isPending || deleteProject.isPending;
  const values = { name: project.name };

  const texts = {
    archive: {
      title: t("projects.confirm.archiveTitle", values),
      description: t("projects.confirm.archiveDescription"),
      confirmLabel: t("projects.confirm.archiveConfirm"),
    },
    restore: {
      title: t("projects.confirm.restoreTitle", values),
      description: t("projects.confirm.restoreDescription"),
      confirmLabel: t("projects.confirm.restoreConfirm"),
    },
    delete: {
      title: t("projects.confirm.deleteTitle", values),
      description: t("projects.confirm.deleteDescription"),
      confirmLabel: t("projects.confirm.deleteConfirm"),
    },
  }[kind];

  function finish(toastMessage: string) {
    toast.success(toastMessage);
    onDone?.();
    onClose();
  }

  function handleConfirm() {
    if (isArchive) {
      archiveProject.mutate(project.id, {
        onSuccess: () => finish(t("projects.toast.archived")),
      });
      return;
    }
    if (isRestore) {
      restoreProject.mutate(project.id, {
        onSuccess: () => finish(t("projects.toast.restored")),
      });
      return;
    }
    deleteProject.mutate(project.id, {
      onSuccess: () => finish(t("projects.toast.deleted")),
    });
  }

  function handleArchiveInstead() {
    archiveProject.mutate(project.id, {
      onSuccess: () => finish(t("projects.toast.archived")),
    });
  }

  const secondaryAction = canArchiveInstead
    ? { label: t("projects.confirm.archiveConfirm"), onSelect: handleArchiveInstead }
    : undefined;

  return (
    <ConfirmDialog
      isOpen
      tone={isDelete ? "danger" : "default"}
      title={texts.title}
      description={texts.description}
      confirmLabel={texts.confirmLabel}
      confirmationText={isDelete ? project.name : undefined}
      isConfirming={isConfirming}
      secondaryAction={secondaryAction}
      onConfirm={handleConfirm}
      onCancel={onClose}
    />
  );
}
