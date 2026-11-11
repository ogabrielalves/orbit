import type { ComponentType, SVGProps } from "react";
import AnnotationsIcon from "@/assets/icons/linha/anotacoes.svg?react";
import CheckIcon from "@/assets/icons/linha/check.svg?react";
import GridIcon from "@/assets/icons/linha/grade.svg?react";
import FolderIcon from "@/assets/icons/linha/nova-pasta.svg?react";
import ProjectsIcon from "@/assets/icons/linha/projetos.svg?react";
import type { FavoriteType } from "@/bindings";

export const favoriteTypeIcons: Record<FavoriteType, ComponentType<SVGProps<SVGSVGElement>>> = {
  project: ProjectsIcon,
  board: GridIcon,
  task: CheckIcon,
  note: AnnotationsIcon,
  folder: FolderIcon,
};
