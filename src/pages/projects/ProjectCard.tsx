import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import MoreIcon from "@/assets/icons/linha/mais-opcoes.svg?react";
import type { Project, ProjectStatus } from "@/bindings";
import { IconButton } from "@/components/atoms/IconButton";
import { ProjectTile } from "@/components/atoms/ProjectTile";
import { DropdownMenu } from "@/components/molecules/DropdownMenu";
import { formatRelativeTime, formatShortDate } from "@/lib/dates";
import { resolveProjectColor } from "@/modules/projects/colors";
import { FavoriteToggle } from "@/pages/favorites/FavoriteToggle";

type ProjectCardProps = {
  project: Project;
  onEdit: (project: Project) => void;
  onArchive: (project: Project) => void;
  onRestore: (project: Project) => void;
  onDelete: (project: Project) => void;
};

const statusClasses: Record<ProjectStatus, { text: string; dot: string }> = {
  active: { text: "text-success-fg", dot: "bg-success" },
  paused: { text: "text-warning-fg", dot: "bg-warning" },
  completed: { text: "text-fg-secondary", dot: "bg-fg-subtle" },
};

export function ProjectCard({ project, onEdit, onArchive, onRestore, onDelete }: ProjectCardProps) {
  const { t, i18n } = useTranslation();

  const isArchived = project.archivedAt !== null;
  const hasDescription = project.description.trim() !== "";
  const status = statusClasses[project.status];
  const createdAt = formatShortDate(new Date(project.createdAt), i18n.language);
  const updatedAt = formatRelativeTime(new Date(project.updatedAt), new Date(), i18n.language);

  const stateAction = isArchived
    ? {
        id: "restore",
        label: t("projects.card.restore"),
        onSelect: () => onRestore(project),
      }
    : {
        id: "archive",
        label: t("projects.card.archive"),
        onSelect: () => onArchive(project),
      };

  return (
    <article className="relative flex flex-col gap-3.5 rounded-2xl border border-border bg-surface p-5 transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <ProjectTile name={project.name} color={resolveProjectColor(project.color)} />
        <div className="flex min-w-0 flex-1 flex-col gap-0.75">
          <Link
            to="/projects/$projectId"
            params={{ projectId: project.id }}
            className="truncate text-heading-3 font-semibold text-fg after:absolute after:inset-0 after:rounded-2xl"
          >
            {project.name}
          </Link>
          <span className={`inline-flex items-center gap-1.5 text-caption ${status.text}`}>
            <span aria-hidden="true" className={`size-1.5 rounded-full ${status.dot}`} />
            {t(`projects.statusName.${project.status}`)}
          </span>
        </div>
        <div className="relative z-10 flex items-center">
          <FavoriteToggle entityType="project" entityId={project.id} name={project.name} />
          <DropdownMenu
            trigger={
              <IconButton
                icon={MoreIcon}
                size="sm"
                label={`${t("projects.card.moreActions")}: ${project.name}`}
              />
            }
            sections={[
              [{ id: "edit", label: t("projects.card.edit"), onSelect: () => onEdit(project) }],
              [
                stateAction,
                {
                  id: "delete",
                  label: t("projects.card.delete"),
                  onSelect: () => onDelete(project),
                  isDanger: true,
                },
              ],
            ]}
          />
        </div>
      </div>

      <p
        className={`line-clamp-2 min-h-10 text-small ${hasDescription ? "text-fg-secondary" : "text-fg-subtle"}`}
      >
        {hasDescription ? project.description : t("projects.noDescription")}
      </p>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border-soft pt-3 text-caption text-fg-muted">
        <span>{t("projects.created", { date: createdAt })}</span>
        <span>{t("projects.updated", { when: updatedAt })}</span>
      </div>
    </article>
  );
}
