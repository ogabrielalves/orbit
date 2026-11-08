import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BoardDetails,
  CreateBoardInput,
  CreateColumnInput,
  UpdateBoardInput,
  UpdateColumnInput,
} from "@/bindings";
import {
  createBoard,
  createColumn,
  deleteBoard,
  deleteColumn,
  fetchBoard,
  moveColumn,
  updateBoard,
  updateColumn,
} from "@/modules/boards/api";
import { moveColumnAfter } from "@/modules/boards/columns";
import { projectKeys } from "@/modules/projects/queries";

export const boardKeys = {
  all: ["boards"] as const,
  detail: (id: string) => ["boards", "detail", id] as const,
};

type UpdateBoardVariables = { id: string; input: UpdateBoardInput };
type UpdateColumnVariables = { id: string; input: UpdateColumnInput };
type MoveColumnVariables = { id: string; afterColumnId: string | null };
type MoveColumnContext = { previous: BoardDetails | undefined };

export function useBoard(id: string, isEnabled = true) {
  return useQuery({
    queryKey: boardKeys.detail(id),
    queryFn: () => fetchBoard(id),
    enabled: isEnabled,
  });
}

export function useCreateBoard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateBoardInput) => createBoard(input),
    onSuccess: (details) => {
      queryClient.setQueryData(boardKeys.detail(details.board.id), details);
      return queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useUpdateBoard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: UpdateBoardVariables) => updateBoard(id, input),
    onSuccess: async (_board, { id }) => {
      await queryClient.invalidateQueries({ queryKey: boardKeys.detail(id) });
      return queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useDeleteBoard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteBoard(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: boardKeys.detail(id) });
      return queryClient.invalidateQueries({ queryKey: projectKeys.all });
    },
  });
}

export function useCreateColumn(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Omit<CreateColumnInput, "boardId">) => createColumn({ boardId, ...input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: boardKeys.detail(boardId) }),
  });
}

export function useUpdateColumn(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: UpdateColumnVariables) => updateColumn(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: boardKeys.detail(boardId) }),
  });
}

export function useDeleteColumn(boardId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteColumn(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: boardKeys.detail(boardId) }),
  });
}

export function useMoveColumn(boardId: string) {
  const queryClient = useQueryClient();
  const queryKey = boardKeys.detail(boardId);

  return useMutation<unknown, unknown, MoveColumnVariables, MoveColumnContext>({
    mutationFn: ({ id, afterColumnId }) => moveColumn(id, afterColumnId),
    onMutate: async ({ id, afterColumnId }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<BoardDetails>(queryKey);

      const hasPrevious = previous !== undefined;
      if (hasPrevious) {
        queryClient.setQueryData<BoardDetails>(queryKey, {
          ...previous,
          columns: moveColumnAfter(previous.columns, id, afterColumnId),
        });
      }

      return { previous };
    },
    onError: (_error, _variables, context) => {
      const hasSnapshot = context?.previous !== undefined;
      if (hasSnapshot) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
}
