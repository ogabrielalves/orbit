import { useMatches, useParams } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import type { BreadcrumbItem } from "@/components/organisms/Topbar";
import { useBoard } from "@/modules/boards/queries";
import { useProject } from "@/modules/projects/queries";

export function useBreadcrumb(): BreadcrumbItem[] {
  const { t } = useTranslation();
  const matches = useMatches();
  const params = useParams({ strict: false });
  const leafRouteId = matches[matches.length - 1]?.routeId;

  const isProjectPage = leafRouteId === "/projects/$projectId";
  const isBoardPage = leafRouteId === "/boards/$boardId";
  const boardId = isBoardPage ? (params.boardId ?? "") : "";
  const boardQuery = useBoard(boardId, false);
  const board = boardQuery.data?.board;
  const projectId = isProjectPage ? (params.projectId ?? "") : (board?.projectId ?? "");
  const shouldFetchProject = isBoardPage && board !== undefined;
  const projectQuery = useProject(projectId, shouldFetchProject);
  const project = projectQuery.data?.project;

  const projectsItem: BreadcrumbItem = {
    label: t("nav.projects"),
    link: { to: "/projects" },
  };

  if (isProjectPage) {
    return project === undefined ? [projectsItem] : [projectsItem, { label: project.name }];
  }

  if (isBoardPage) {
    if (board === undefined) {
      return [projectsItem];
    }
    const projectItem: BreadcrumbItem | null =
      project === undefined
        ? null
        : { label: project.name, link: { to: "/projects/$projectId", params: { projectId } } };
    return [projectsItem, ...(projectItem === null ? [] : [projectItem]), { label: board.name }];
  }

  return matches.flatMap((match) => {
    const titleKey = match.staticData.titleKey;
    const hasTitle = titleKey !== undefined;
    return hasTitle ? [{ label: t(titleKey) }] : [];
  });
}
