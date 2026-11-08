import {
  type CreateProjectInput,
  commands,
  type ListProjectsInput,
  type Project,
  type ProjectDetails,
  type UpdateProjectInput,
} from "@/bindings";
import { unwrapResult } from "@/lib/unwrapResult";

export async function fetchProjects(input: ListProjectsInput): Promise<Project[]> {
  return unwrapResult(await commands.listProjects(input));
}

export async function fetchProject(id: string): Promise<ProjectDetails> {
  return unwrapResult(await commands.getProject(id));
}

export async function createProject(input: CreateProjectInput): Promise<Project> {
  return unwrapResult(await commands.createProject(input));
}

export async function updateProject(id: string, input: UpdateProjectInput): Promise<Project> {
  return unwrapResult(await commands.updateProject(id, input));
}

export async function archiveProject(id: string): Promise<Project> {
  return unwrapResult(await commands.archiveProject(id));
}

export async function restoreProject(id: string): Promise<Project> {
  return unwrapResult(await commands.restoreProject(id));
}

export async function deleteProject(id: string): Promise<null> {
  return unwrapResult(await commands.deleteProject(id));
}
