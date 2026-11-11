import type {
  ActivityAction,
  CreateProjectInput,
  FieldChange,
  Project,
  ProjectDetails,
  UpdateProjectInput,
} from "@/bindings";
import { fail } from "./failure";
import type { State } from "./state";

const NAME_MAX_LENGTH = 120;

export type Clock = { nextId: (prefix: string) => string; now: () => string };

function requireName(value: string): string {
  const name = value.trim();
  if (name === "") {
    fail("VALIDATION", "project name must not be blank");
  }
  if (name.length > NAME_MAX_LENGTH) {
    fail("VALIDATION", "project name is too long");
  }
  return name;
}

function optionalText(value: string | null | undefined): string | null {
  const text = value?.trim() ?? "";
  return text === "" ? null : text;
}

function findProject(state: State, id: string): Project {
  const project = state.projects.find((candidate) => candidate.id === id);
  if (project === undefined) {
    fail("NOT_FOUND", "project not found");
  }
  return project;
}

function diff(before: Project, after: Project): Record<string, FieldChange> {
  const changes: Record<string, FieldChange> = {};
  const fields = ["name", "description", "icon", "color", "status"] as const;
  for (const field of fields) {
    if (before[field] !== after[field]) {
      changes[field] = { from: before[field], to: after[field] };
    }
  }
  return changes;
}

export function createProjects(state: State, clock: Clock) {
  function record(
    projectId: string,
    action: ActivityAction,
    changes: Record<string, FieldChange> | null,
  ) {
    state.activity.unshift({
      id: clock.nextId("a"),
      entityType: "project",
      entityId: projectId,
      action,
      changes,
      createdAt: clock.now(),
    });
  }

  function replace(project: Project) {
    state.projects = state.projects.map((candidate) =>
      candidate.id === project.id ? project : candidate,
    );
  }

  function create(input: CreateProjectInput): Project {
    const now = clock.now();
    const project: Project = {
      id: clock.nextId("p"),
      name: requireName(input.name),
      description: input.description?.trim() ?? "",
      icon: optionalText(input.icon),
      color: optionalText(input.color),
      status: "active",
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
    };
    state.projects.push(project);
    record(project.id, "created", { name: { from: null, to: project.name } });
    return project;
  }

  function update(id: string, input: UpdateProjectInput): Project {
    const current = findProject(state, id);
    const next: Project = { ...current };
    if (input.name !== undefined && input.name !== null) {
      next.name = requireName(input.name);
    }
    if (input.description !== undefined && input.description !== null) {
      next.description = input.description.trim();
    }
    if (input.icon !== undefined) {
      next.icon = optionalText(input.icon);
    }
    if (input.color !== undefined) {
      next.color = optionalText(input.color);
    }
    if (input.status !== undefined && input.status !== null) {
      next.status = input.status;
    }
    const changes = diff(current, next);
    if (Object.keys(changes).length === 0) {
      return current;
    }
    next.updatedAt = clock.now();
    replace(next);
    record(id, "updated", changes);
    return next;
  }

  function setArchived(id: string, isArchived: boolean): Project {
    const current = findProject(state, id);
    if ((current.archivedAt !== null) === isArchived) {
      return current;
    }
    const now = clock.now();
    const next: Project = { ...current, archivedAt: isArchived ? now : null, updatedAt: now };
    replace(next);
    record(id, isArchived ? "archived" : "restored", null);
    return next;
  }

  function remove(id: string): null {
    const current = findProject(state, id);
    state.projects = state.projects.filter((candidate) => candidate.id !== id);
    state.favorites = state.favorites.filter((favorite) => favorite.entityId !== id);
    record(id, "deleted", { name: { from: current.name, to: null } });
    return null;
  }

  function get(id: string): ProjectDetails {
    return {
      project: findProject(state, id),
      boards: [],
      taskCount: 0,
      backlogTaskCount: 0,
    };
  }

  return { create, update, setArchived, remove, get };
}
