import { useNavigate, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/molecules/EmptyState";
import { PageHeader } from "@/components/molecules/PageHeader";
import { ProjectsToolbar } from "@/pages/projects/ProjectsToolbar";
import { type ProjectsSearch, resolveProjectsFilters } from "@/pages/projects/projectsSearch";

export function ProjectsPage() {
  const { t } = useTranslation();
  const search = useSearch({ from: "/projects" });
  const navigate = useNavigate({ from: "/projects" });

  const filters = resolveProjectsFilters(search);
  const isArchivedScope = filters.scope === "archived";
  const emptyKey = isArchivedScope ? "projects.emptyArchived" : "projects.empty";

  function handleFiltersChange(patch: ProjectsSearch) {
    void navigate({ search: (previous) => ({ ...previous, ...patch }), replace: true });
  }

  return (
    <>
      <PageHeader title={t("nav.projects")} />
      <ProjectsToolbar filters={filters} onChange={handleFiltersChange} />
      <EmptyState title={t(`${emptyKey}.title`)} description={t(`${emptyKey}.description`)} />
    </>
  );
}
