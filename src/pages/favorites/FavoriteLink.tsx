import { Link } from "@tanstack/react-router";
import type { ComponentProps } from "react";
import type { FavoriteEntry } from "@/bindings";

type FavoriteLinkProps = Omit<ComponentProps<"a">, "href"> & {
  entry: FavoriteEntry;
};

export function FavoriteLink({ entry, children, ...rest }: FavoriteLinkProps) {
  switch (entry.entityType) {
    case "project":
      return (
        <Link to="/projects/$projectId" params={{ projectId: entry.entityId }} {...rest}>
          {children}
        </Link>
      );
    case "board":
      return (
        <Link to="/boards/$boardId" params={{ boardId: entry.entityId }} {...rest}>
          {children}
        </Link>
      );
    case "task": {
      const taskId = entry.parentTaskId ?? entry.entityId;
      const boardId = entry.boardId;
      if (boardId !== null) {
        return (
          <Link to="/boards/$boardId" params={{ boardId }} search={{ task: taskId }} {...rest}>
            {children}
          </Link>
        );
      }
      return (
        <Link to="/backlog" search={{ task: taskId }} {...rest}>
          {children}
        </Link>
      );
    }
    case "note":
      return (
        <Link to="/notes/$noteId" params={{ noteId: entry.entityId }} {...rest}>
          {children}
        </Link>
      );
    case "folder":
      return (
        <Link to="/notes" search={{ folder: entry.path ?? entry.entityId }} {...rest}>
          {children}
        </Link>
      );
  }
}
