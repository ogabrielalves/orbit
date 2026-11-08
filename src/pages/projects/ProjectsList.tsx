import type { Project } from "@/bindings";
import { ProjectCard } from "@/pages/projects/ProjectCard";
import type { ProjectView } from "@/pages/projects/projectsSearch";

type ProjectsListProps = {
  projects: Project[];
  view: ProjectView;
  onEdit: (project: Project) => void;
  onArchive: (project: Project) => void;
  onRestore: (project: Project) => void;
  onDelete: (project: Project) => void;
};

const viewClasses: Record<ProjectView, string> = {
  grid: "grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3",
  list: "grid grid-cols-1 gap-3",
};

export function ProjectsList({ projects, view, ...handlers }: ProjectsListProps) {
  return (
    <div className={viewClasses[view]}>
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} {...handlers} />
      ))}
    </div>
  );
}
