import { useNavigate } from "@tanstack/react-router";
import type { SearchHit } from "@/bindings";
import type { SearchCategory } from "@/modules/search/results";

export function useOpenSearchHit() {
  const navigate = useNavigate();

  return (category: SearchCategory, hit: SearchHit): void => {
    switch (category) {
      case "projects":
        void navigate({ to: "/projects/$projectId", params: { projectId: hit.entityId } });
        return;
      case "boards":
        void navigate({ to: "/boards/$boardId", params: { boardId: hit.entityId } });
        return;
      case "tasks": {
        const taskId = hit.parentTaskId ?? hit.entityId;
        const boardId = hit.boardId;
        if (boardId !== null) {
          void navigate({
            to: "/boards/$boardId",
            params: { boardId },
            search: { task: taskId },
          });
          return;
        }
        void navigate({ to: "/backlog", search: { task: taskId } });
        return;
      }
      case "notes":
        void navigate({ to: "/notes/$noteId", params: { noteId: hit.entityId } });
        return;
      case "folders": {
        const folder = hit.path ?? undefined;
        void navigate({ to: "/notes", search: { folder } });
        return;
      }
    }
  };
}
