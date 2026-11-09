import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateTaskInput, UpdateTaskInput } from "@/bindings";
import { boardKeys } from "@/modules/boards/queries";
import { dashboardKeys } from "@/modules/dashboard/queries";
import { projectKeys } from "@/modules/projects/queries";
import {
  archiveTask,
  createTask,
  deleteTask,
  fetchBoardTasks,
  fetchTask,
  restoreTask,
  sendTaskToBacklog,
  sendTaskToBoard,
  updateTask,
} from "@/modules/tasks/api";

export const taskKeys = {
  all: ["tasks"] as const,
  board: (boardId: string) => ["tasks", "board", boardId] as const,
  detail: (id: string) => ["tasks", "detail", id] as const,
};

type UpdateTaskVariables = { id: string; input: UpdateTaskInput };
type SendTaskToBoardVariables = { id: string; boardId: string; columnId: string | null };

export function useBoardTasks(boardId: string, isEnabled = true) {
  return useQuery({
    queryKey: taskKeys.board(boardId),
    queryFn: () => fetchBoardTasks(boardId),
    enabled: isEnabled,
  });
}

export function useTask(id: string, isEnabled = true) {
  return useQuery({
    queryKey: taskKeys.detail(id),
    queryFn: () => fetchTask(id),
    enabled: isEnabled,
  });
}

// Tasks feed the column counters of the board, the project stats and the dashboard.
export function useInvalidateTasks() {
  const queryClient = useQueryClient();

  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: taskKeys.all }),
      queryClient.invalidateQueries({ queryKey: boardKeys.all }),
      queryClient.invalidateQueries({ queryKey: projectKeys.all }),
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all }),
    ]);
}

export function useCreateTask() {
  const invalidateTasks = useInvalidateTasks();

  return useMutation({
    mutationFn: (input: CreateTaskInput) => createTask(input),
    onSuccess: invalidateTasks,
  });
}

export function useUpdateTask() {
  const invalidateTasks = useInvalidateTasks();

  return useMutation({
    mutationFn: ({ id, input }: UpdateTaskVariables) => updateTask(id, input),
    onSuccess: invalidateTasks,
  });
}

export function useArchiveTask() {
  const invalidateTasks = useInvalidateTasks();

  return useMutation({
    mutationFn: (id: string) => archiveTask(id),
    onSuccess: invalidateTasks,
  });
}

export function useRestoreTask() {
  const invalidateTasks = useInvalidateTasks();

  return useMutation({
    mutationFn: (id: string) => restoreTask(id),
    onSuccess: invalidateTasks,
  });
}

export function useDeleteTask() {
  const invalidateTasks = useInvalidateTasks();

  return useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onSuccess: invalidateTasks,
  });
}

export function useSendTaskToBoard() {
  const invalidateTasks = useInvalidateTasks();

  return useMutation({
    mutationFn: ({ id, boardId, columnId }: SendTaskToBoardVariables) =>
      sendTaskToBoard(id, boardId, columnId),
    onSuccess: invalidateTasks,
  });
}

export function useSendTaskToBacklog() {
  const invalidateTasks = useInvalidateTasks();

  return useMutation({
    mutationFn: (id: string) => sendTaskToBacklog(id),
    onSuccess: invalidateTasks,
  });
}
