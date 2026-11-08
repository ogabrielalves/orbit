import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import BackIcon from "@/assets/icons/linha/voltar.svg?react";
import { ErrorState } from "@/components/molecules/ErrorState";
import { ProjectFormModal } from "@/components/organisms/ProjectFormModal";
import { getErrorMessageKey } from "@/lib/appError";
import { useProject } from "@/modules/projects/queries";
import { useProjectForm } from "@/modules/projects/useProjectForm";
import { ProjectBoards } from "@/pages/projects/ProjectBoards";
import {
  ProjectConfirmDialog,
  type ProjectConfirmKind,
} from "@/pages/projects/ProjectConfirmDialog";
import { ProjectDetailHeader } from "@/pages/projects/ProjectDetailHeader";
import { ProjectDetailSkeleton } from "@/pages/projects/ProjectDetailSkeleton";
import { ProjectStats } from "@/pages/projects/ProjectStats";

export function ProjectDetailPage() {
  const { t } = useTranslation();
  const { projectId } = useParams({ from: "/projects/$projectId" });
  const navigate = useNavigate();
  const [isDeleted, setIsDeleted] = useState(false);
  const detailsQuery = useProject(projectId, !isDeleted);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [confirmKind, setConfirmKind] = useState<ProjectConfirmKind | null>(null);

  const details = detailsQuery.data;
  const projectForm = useProjectForm(details?.project, () => setIsFormOpen(false));
  const isLoading = detailsQuery.isPending;
  const hasFailed = detailsQuery.isError;
  const hasDetails = details !== undefined;
  const isConfirmOpen = confirmKind !== null;
  const isDeleteConfirm = confirmKind === "delete";

  function handleDeleted() {
    setIsDeleted(true);
    void navigate({ to: "/projects" });
  }

  return (
    <>
      <Link
        to="/projects"
        className="inline-flex w-fit items-center gap-1 text-small font-medium text-fg-muted transition-colors hover:text-fg"
      >
        <BackIcon aria-hidden="true" className="size-4" />
        {t("projects.detail.back")}
      </Link>

      {isLoading && <ProjectDetailSkeleton />}
      {hasFailed && (
        <ErrorState
          title={t("projects.detail.loadError")}
          description={t(getErrorMessageKey(detailsQuery.error))}
          onRetry={() => void detailsQuery.refetch()}
        />
      )}
      {hasDetails && (
        <>
          <ProjectDetailHeader
            project={details.project}
            onEdit={() => setIsFormOpen(true)}
            onArchive={() => setConfirmKind("archive")}
            onRestore={() => setConfirmKind("restore")}
            onDelete={() => setConfirmKind("delete")}
          />
          <ProjectStats
            taskCount={details.taskCount}
            backlogTaskCount={details.backlogTaskCount}
            boardCount={details.boards.length}
          />
          <ProjectBoards boards={details.boards} />
          {isFormOpen && (
            <ProjectFormModal
              mode={projectForm.mode}
              initialValues={projectForm.initialValues}
              colorOptions={projectForm.colorOptions}
              isSubmitting={projectForm.isSubmitting}
              onSubmit={projectForm.submit}
              onOpenChange={() => setIsFormOpen(false)}
            />
          )}
          {isConfirmOpen && (
            <ProjectConfirmDialog
              kind={confirmKind}
              project={details.project}
              onClose={() => setConfirmKind(null)}
              onDone={isDeleteConfirm ? handleDeleted : undefined}
            />
          )}
        </>
      )}
    </>
  );
}
