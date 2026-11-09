import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ListProjectsInput, UpdateProjectInput } from "@/bindings";
import { dashboardKeys } from "@/modules/dashboard/queries";
import {
  archiveProject,
  createProject,
  deleteProject,
  fetchProject,
  fetchProjects,
  restoreProject,
  updateProject,
} from "@/modules/projects/api";

export const projectKeys = {
  all: ["projects"] as const,
  list: (input: ListProjectsInput) => ["projects", "list", input] as const,
  detail: (id: string) => ["projects", "detail", id] as const,
};

type UpdateProjectVariables = {
  id: string;
  input: UpdateProjectInput;
};

export function useProjects(input: ListProjectsInput) {
  return useQuery({
    queryKey: projectKeys.list(input),
    queryFn: () => fetchProjects(input),
    placeholderData: keepPreviousData,
  });
}

export function useProject(id: string, isEnabled = true) {
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: () => fetchProject(id),
    enabled: isEnabled,
  });
}

function useInvalidateProjects() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: projectKeys.all }),
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all }),
    ]);
}

export function useCreateProject() {
  const invalidateProjects = useInvalidateProjects();

  return useMutation({
    mutationFn: createProject,
    onSuccess: invalidateProjects,
  });
}

export function useUpdateProject() {
  const invalidateProjects = useInvalidateProjects();

  return useMutation({
    mutationFn: ({ id, input }: UpdateProjectVariables) => updateProject(id, input),
    onSuccess: invalidateProjects,
  });
}

export function useArchiveProject() {
  const invalidateProjects = useInvalidateProjects();

  return useMutation({
    mutationFn: archiveProject,
    onSuccess: invalidateProjects,
  });
}

export function useRestoreProject() {
  const invalidateProjects = useInvalidateProjects();

  return useMutation({
    mutationFn: restoreProject,
    onSuccess: invalidateProjects,
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  const invalidateProjects = useInvalidateProjects();

  return useMutation({
    mutationFn: deleteProject,
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: projectKeys.detail(id) });
      return invalidateProjects();
    },
  });
}
