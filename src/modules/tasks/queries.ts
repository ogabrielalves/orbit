import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BoardDetails, CreateTaskInput, Task, UpdateTaskInput } from "@/bindings";
import { boardKeys } from "@/modules/boards/queries";
import { dashboardKeys } from "@/modules/dashboard/queries";
import { projectKeys } from "@/modules/projects/queries";
import {
  archiveTask,
  createTask,
  deleteTask,
  fetchBoardTasks,
  fetchTask,
  moveTask,
  restoreTask,
  sendTaskToBacklog,
  sendTaskToBoard,
  updateTask,
} from "@/modules/tasks/api";
import { applyTaskMove, shiftTaskCount } from "@/modules/tasks/moves";

export const taskKeys = {
  all: ["tasks"] as const,
  board: (boardId: string) => ["tasks", "board", boardId] as const,
  detail: (id: string) => ["tasks", "detail", id] as const,
};

type UpdateTaskVariables = { id: string; input: UpdateTaskInput };
type SendTaskToBoardVariables = { id: string; boardId: string; columnId: string | null };
type MoveTaskVariables = { id: string; columnId: string; afterTaskId: string | null };
type MoveTaskContext = {
  previousTasks: Task[] | undefined;
  previousBoard: BoardDetails | undefined;
};

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

export function useMoveTask(boardId: string) {
  const queryClient = useQueryClient();
  const invalidateTasks = useInvalidateTasks();
  const tasksKey = taskKeys.board(boardId);
  const boardKey = boardKeys.detail(boardId);

  return useMutation<Task, unknown, MoveTaskVariables, MoveTaskContext>({
    mutationFn: ({ id, columnId, afterTaskId }) => moveTask(id, columnId, afterTaskId),
    onMutate: async ({ id, columnId, afterTaskId }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: tasksKey }),
        queryClient.cancelQueries({ queryKey: boardKey }),
      ]);
      const previousTasks = queryClient.getQueryData<Task[]>(tasksKey);
      const previousBoard = queryClient.getQueryData<BoardDetails>(boardKey);

      const moved = previousTasks?.find((task) => task.id === id);
      if (previousTasks !== undefined && moved !== undefined) {
        queryClient.setQueryData<Task[]>(
          tasksKey,
          applyTaskMove(previousTasks, { taskId: id, columnId, afterTaskId }),
        );
        const origin = moved.columnId;
        if (previousBoard !== undefined && origin !== null) {
          queryClient.setQueryData<BoardDetails>(boardKey, {
            ...previousBoard,
            columns: shiftTaskCount(previousBoard.columns, origin, columnId),
          });
        }
      }

      return { previousTasks, previousBoard };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousTasks !== undefined) {
        queryClient.setQueryData(tasksKey, context.previousTasks);
      }
      if (context?.previousBoard !== undefined) {
        queryClient.setQueryData(boardKey, context.previousBoard);
      }
    },
    onSettled: invalidateTasks,
  });
}
