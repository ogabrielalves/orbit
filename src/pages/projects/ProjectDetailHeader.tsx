import { useTranslation } from "react-i18next";
import MoreIcon from "@/assets/icons/linha/mais-opcoes.svg?react";
import type { Project, ProjectStatus } from "@/bindings";
import { Badge } from "@/components/atoms/Badge";
import { Button } from "@/components/atoms/Button";
import { IconButton } from "@/components/atoms/IconButton";
import { ProjectTile } from "@/components/atoms/ProjectTile";
import { DropdownMenu } from "@/components/molecules/DropdownMenu";
import { formatRelativeTime, formatShortDate } from "@/lib/dates";
import { resolveProjectColor } from "@/modules/projects/colors";
import { FavoriteToggle } from "@/pages/favorites/FavoriteToggle";

type ProjectDetailHeaderProps = {
  project: Project;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
};

const statusTones: Record<ProjectStatus, "success" | "warning" | "neutral"> = {
  active: "success",
  paused: "warning",
  completed: "neutral",
};

export function ProjectDetailHeader({
  project,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
}: ProjectDetailHeaderProps) {
  const { t, i18n } = useTranslation();

  const isArchived = project.archivedAt !== null;
  const hasDescription = project.description.trim() !== "";
  const createdAt = formatShortDate(new Date(project.createdAt), i18n.language);
  const updatedAt = formatRelativeTime(new Date(project.updatedAt), new Date(), i18n.language);

  const stateAction = isArchived
    ? { id: "restore", label: t("projects.card.restore"), onSelect: onRestore }
    : { id: "archive", label: t("projects.card.archive"), onSelect: onArchive };

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-4">
        <ProjectTile name={project.name} color={resolveProjectColor(project.color)} size="lg" />
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="font-display text-heading-1 font-semibold text-fg">{project.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTones[project.status]} shape="pill" hasDot>
              {t(`projects.statusName.${project.status}`)}
            </Badge>
            {isArchived && (
              <Badge tone="outline" shape="pill">
                {t("projects.detail.archivedBadge")}
              </Badge>
            )}
          </div>
          {hasDescription && (
            <p className="max-w-150 text-body text-fg-secondary">{project.description}</p>
          )}
          <p className="text-caption text-fg-muted">
            {t("projects.created", { date: createdAt })} ·{" "}
            {t("projects.updated", { when: updatedAt })}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <FavoriteToggle entityType="project" entityId={project.id} name={project.name} />
        <Button variant="secondary" onClick={onEdit}>
          {t("projects.detail.edit")}
        </Button>
        <DropdownMenu
          trigger={<IconButton icon={MoreIcon} label={t("projects.card.moreActions")} />}
          sections={[
            [
              stateAction,
              {
                id: "delete",
                label: t("projects.card.delete"),
                onSelect: onDelete,
                isDanger: true,
              },
            ],
          ]}
        />
      </div>
    </header>
  );
}
