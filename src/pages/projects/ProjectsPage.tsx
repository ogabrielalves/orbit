import { useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import PlusIcon from "@/assets/icons/linha/mais.svg?react";
import type { Project } from "@/bindings";
import { Button } from "@/components/atoms/Button";
import { ErrorState } from "@/components/molecules/ErrorState";
import { PageHeader } from "@/components/molecules/PageHeader";
import { ProjectFormModal } from "@/components/organisms/ProjectFormModal";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { getErrorMessageKey } from "@/lib/appError";
import { useProjects } from "@/modules/projects/queries";
import { sortProjects } from "@/modules/projects/sort";
import { useProjectForm } from "@/modules/projects/useProjectForm";
import {
  ProjectConfirmDialog,
  type ProjectConfirmKind,
} from "@/pages/projects/ProjectConfirmDialog";
import { ProjectsEmptyState } from "@/pages/projects/ProjectsEmptyState";
import { ProjectsList } from "@/pages/projects/ProjectsList";
import { ProjectsSkeleton } from "@/pages/projects/ProjectsSkeleton";
import { ProjectsToolbar } from "@/pages/projects/ProjectsToolbar";
import { buildListInput, hasActiveFilters } from "@/pages/projects/projectsQuery";
import { type ProjectsSearch, resolveProjectsFilters } from "@/pages/projects/projectsSearch";

const SEARCH_DEBOUNCE_IN_MILLISECONDS = 250;

type FormState = { project: Project | undefined } | null;
type ConfirmState = { kind: ProjectConfirmKind; project: Project } | null;

export function ProjectsPage() {
  const { t, i18n } = useTranslation();
  const search = useSearch({ from: "/projects" });
  const navigate = useNavigate({ from: "/projects" });
  const [formState, setFormState] = useState<FormState>(null);
  const [confirmState, setConfirmState] = useState<ConfirmState>(null);

  const projectForm = useProjectForm(formState?.project, () => setFormState(null));

  const filters = resolveProjectsFilters(search);
  const debouncedQuery = useDebouncedValue(filters.q, SEARCH_DEBOUNCE_IN_MILLISECONDS);
  const projectsQuery = useProjects(buildListInput({ ...filters, q: debouncedQuery }));

  const projects = sortProjects(projectsQuery.data ?? [], filters.sort, i18n.language);
  const isLoading = projectsQuery.isPending;
  const hasFailed = projectsQuery.isError;
  const hasLoaded = projectsQuery.isSuccess;
  const hasProjects = projects.length > 0;
  const hasNoProjects = hasLoaded && !hasProjects;
  const isArchivedScope = filters.scope === "archived";
  const isFormOpen = formState !== null;
  const isConfirmOpen = confirmState !== null;

  function handleFiltersChange(patch: ProjectsSearch) {
    void navigate({ search: (previous) => ({ ...previous, ...patch }), replace: true });
  }

  function handleClearFilters() {
    void navigate({
      search: (previous) => ({ ...previous, q: undefined, status: undefined }),
      replace: true,
    });
  }

  function openCreateForm() {
    setFormState({ project: undefined });
  }

  function openConfirm(kind: ProjectConfirmKind, project: Project) {
    setConfirmState({ kind, project });
  }

  return (
    <>
      <PageHeader
        title={t("nav.projects")}
        subtitle={hasLoaded ? t("projects.count", { count: projects.length }) : undefined}
        actions={
          <Button icon={PlusIcon} onClick={openCreateForm}>
            {t("projects.newProject")}
          </Button>
        }
      />
      <ProjectsToolbar filters={filters} onChange={handleFiltersChange} />

      {isLoading && <ProjectsSkeleton />}
      {hasFailed && (
        <ErrorState
          title={t("projects.loadError")}
          description={t(getErrorMessageKey(projectsQuery.error))}
          onRetry={() => void projectsQuery.refetch()}
        />
      )}
      {hasNoProjects && (
        <ProjectsEmptyState
          hasFilters={hasActiveFilters(filters)}
          isArchivedScope={isArchivedScope}
          onClearFilters={handleClearFilters}
          onCreate={openCreateForm}
        />
      )}
      {hasProjects && (
        <ProjectsList
          projects={projects}
          view={filters.view}
          onEdit={(project) => setFormState({ project })}
          onArchive={(project) => openConfirm("archive", project)}
          onRestore={(project) => openConfirm("restore", project)}
          onDelete={(project) => openConfirm("delete", project)}
        />
      )}

      {isFormOpen && (
        <ProjectFormModal
          key={formState.project?.id ?? "new"}
          mode={projectForm.mode}
          initialValues={projectForm.initialValues}
          colorOptions={projectForm.colorOptions}
          isSubmitting={projectForm.isSubmitting}
          onSubmit={projectForm.submit}
          onOpenChange={() => setFormState(null)}
        />
      )}
      {isConfirmOpen && (
        <ProjectConfirmDialog
          key={`${confirmState.kind}-${confirmState.project.id}`}
          kind={confirmState.kind}
          project={confirmState.project}
          onClose={() => setConfirmState(null)}
        />
      )}
    </>
  );
}
