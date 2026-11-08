import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ProjectTile } from "@/components/atoms/ProjectTile";
import { Skeleton } from "@/components/atoms/Skeleton";
import { EmptyState } from "@/components/molecules/EmptyState";
import { ErrorState } from "@/components/molecules/ErrorState";
import { getErrorMessageKey } from "@/lib/appError";
import { formatRelativeTime } from "@/lib/dates";
import { resolveProjectColor } from "@/modules/projects/colors";
import { useProjects } from "@/modules/projects/queries";
import { sortProjects } from "@/modules/projects/sort";
import { DashboardCard } from "@/pages/dashboard/DashboardCard";

const VISIBLE_PROJECTS = 5;
const placeholderIds = ["a", "b", "c"];

export function ActiveProjectsCard() {
  const { t, i18n } = useTranslation();
  const projectsQuery = useProjects({ scope: "active", status: "active", search: null });

  const isLoading = projectsQuery.isPending;
  const hasFailed = projectsQuery.isError;
  const hasLoaded = projectsQuery.isSuccess;
  const projects = sortProjects(projectsQuery.data ?? [], "updated", i18n.language).slice(
    0,
    VISIBLE_PROJECTS,
  );
  const hasProjects = projects.length > 0;
  const hasNoProjects = hasLoaded && !hasProjects;

  return (
    <DashboardCard
      title={t("dashboard.activeProjects.title")}
      action={
        <Link to="/projects" className="text-primary hover:text-primary-hover">
          {t("dashboard.activeProjects.viewAll")}
        </Link>
      }
    >
      {isLoading && (
        <div role="status" aria-busy="true" className="flex flex-col gap-3">
          <span className="sr-only">{t("common.loading")}</span>
          {placeholderIds.map((id) => (
            <div key={id} className="flex items-center gap-3">
              <Skeleton className="size-6 rounded-sm" />
              <Skeleton className="h-3.5 flex-1" />
            </div>
          ))}
        </div>
      )}
      {hasFailed && (
        <ErrorState
          title={t("dashboard.activeProjects.loadError")}
          description={t(getErrorMessageKey(projectsQuery.error))}
          onRetry={() => void projectsQuery.refetch()}
        />
      )}
      {hasNoProjects && (
        <EmptyState
          title={t("dashboard.activeProjects.empty.title")}
          description={t("dashboard.activeProjects.empty.description")}
        />
      )}
      {hasProjects && (
        <ul className="flex flex-col">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                to="/projects/$projectId"
                params={{ projectId: project.id }}
                className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-surface-muted"
              >
                <ProjectTile
                  name={project.name}
                  color={resolveProjectColor(project.color)}
                  size="sm"
                />
                <span className="min-w-0 flex-1 truncate text-body font-medium text-fg">
                  {project.name}
                </span>
                <span className="shrink-0 text-caption text-fg-muted">
                  {formatRelativeTime(new Date(project.updatedAt), new Date(), i18n.language)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashboardCard>
  );
}
