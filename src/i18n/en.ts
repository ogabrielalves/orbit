import type { ptBR } from "@/i18n/pt-BR";
import type { Widen } from "@/i18n/types";

export const en: Widen<typeof ptBR> = {
  app: {
    name: "ORBIT",
    wordmark: "orbit",
  },
  nav: {
    label: "Main navigation",
    dashboard: "Dashboard",
    projects: "My projects",
    tasks: "Tasks",
    boards: "Boards",
    backlog: "Backlog",
    notes: "Notes",
    graph: "Graph",
    favorites: "Favorites",
    archived: "Archived",
    settings: "Settings",
  },
  sidebar: {
    newProject: "New project",
    collapse: "Collapse menu",
    expand: "Expand menu",
    favoritesTitle: "Favorites",
  },
  topbar: {
    breadcrumbLabel: "Breadcrumb",
    searchPlaceholder: "Search everything…",
    create: "Create",
  },
  projects: {
    searchLabel: "Search projects",
    searchPlaceholder: "Search projects…",
    scopeLabel: "Which projects to show",
    scope: {
      active: "Active",
      archived: "Archived",
    },
    statusLabel: "Filter by status",
    status: {
      all: "All",
      active: "Active",
      paused: "Paused",
      completed: "Completed",
    },
    sortLabel: "Sort by",
    sort: {
      updated: "Recently updated",
      name: "Name",
      created: "Date created",
    },
    viewLabel: "View mode",
    view: {
      grid: "Grid view",
      list: "List view",
    },
    empty: {
      title: "No projects yet",
      description: "Your projects will appear here.",
    },
    emptyArchived: {
      title: "No archived projects",
      description: "Projects you archive will appear here.",
    },
  },
  greeting: {
    morning: "Good morning",
    afternoon: "Good afternoon",
    evening: "Good evening",
  },
  common: {
    save: "Save",
    cancel: "Cancel",
    delete: "Delete",
    close: "Close",
    retry: "Try again",
    loading: "Loading…",
    optional: "optional",
  },
  confirm: {
    typeToConfirm: "Type <strong>{{text}}</strong> to confirm",
  },
  errors: {
    pageNotFound: "Page not found",
    unknown: "Something went wrong. Please try again.",
    notFound: "The item was not found. It may have been removed.",
    validation: "The information provided is not valid.",
    conflict: "The item was changed elsewhere. Reload and try again.",
    invalidMove: "This move is not allowed.",
    io: "Could not access the files. Check the folder permissions.",
    database: "Could not access the application data.",
  },
};
