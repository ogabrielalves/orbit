import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BoardDetails,
  CreateSubtaskInput,
  CreateTaskInput,
  Task,
  UpdateTaskInput,
} from "@/bindings";
import { applyReorder, type Reorder } from "@/lib/reorder";
import { activityKeys } from "@/modules/activity/queries";
import { backlogKeys } from "@/modules/backlog/queries";
import { boardKeys } from "@/modules/boards/queries";
import { dashboardKeys } from "@/modules/dashboard/queries";
import { projectKeys } from "@/modules/projects/queries";
import {
  archiveTask,
  createSubtask,
  createTask,
  deleteTask,
  duplicateTask,
  fetchBoardTasks,
  fetchSubtasks,
  fetchTask,
  moveSubtask,
  moveTask,
  restoreTask,
  sendTaskToBacklog,
  sendTaskToBoard,
  setSubtaskDone,
  updateTask,
} from "@/modules/tasks/api";
import { applyTaskMove, shiftTaskCount } from "@/modules/tasks/moves";

export const taskKeys = {
  all: ["tasks"] as const,
  board: (boardId: string) => ["tasks", "board", boardId] as const,
  detail: (id: string) => ["tasks", "detail", id] as const,
  subtasks: (parentTaskId: string) => ["tasks", "subtasks", parentTaskId] as const,
};

type UpdateTaskVariables = { id: string; input: UpdateTaskInput };
type SendTaskToBoardVariables = { id: string; boardId: string; columnId: string | null };
type DuplicateTaskVariables = { id: string; title: string | null };
type SetSubtaskDoneVariables = { id: string; isDone: boolean };
type MoveSubtaskContext = { previous: Task[] | undefined };
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

export function useInvalidateTasks() {
  const queryClient = useQueryClient();

  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: taskKeys.all }),
      queryClient.invalidateQueries({ queryKey: boardKeys.all }),
      queryClient.invalidateQueries({ queryKey: projectKeys.all }),
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all }),
      queryClient.invalidateQueries({ queryKey: activityKeys.all }),
      queryClient.invalidateQueries({ queryKey: backlogKeys.all }),
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

export function useDuplicateTask() {
  const invalidateTasks = useInvalidateTasks();

  return useMutation({
    mutationFn: ({ id, title }: DuplicateTaskVariables) => duplicateTask(id, title),
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

export function useSubtasks(parentTaskId: string, isEnabled = true) {
  return useQuery({
    queryKey: taskKeys.subtasks(parentTaskId),
    queryFn: () => fetchSubtasks(parentTaskId),
    enabled: isEnabled,
  });
}

export function useCreateSubtask(parentTaskId: string) {
  const invalidateTasks = useInvalidateTasks();

  return useMutation({
    mutationFn: (title: string) => {
      const input: CreateSubtaskInput = { parentTaskId, title };
      return createSubtask(input);
    },
    onSuccess: invalidateTasks,
  });
}

export function useSetSubtaskDone() {
  const invalidateTasks = useInvalidateTasks();

  return useMutation({
    mutationFn: ({ id, isDone }: SetSubtaskDoneVariables) => setSubtaskDone(id, isDone),
    onSuccess: invalidateTasks,
  });
}

export function useMoveSubtask(parentTaskId: string) {
  const queryClient = useQueryClient();
  const invalidateTasks = useInvalidateTasks();
  const queryKey = taskKeys.subtasks(parentTaskId);

  return useMutation<Task, unknown, Reorder, MoveSubtaskContext>({
    mutationFn: ({ id, afterId }) => moveSubtask(id, afterId),
    onMutate: async (reorder) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Task[]>(queryKey);

      const hasPrevious = previous !== undefined;
      if (hasPrevious) {
        queryClient.setQueryData<Task[]>(queryKey, applyReorder(previous, reorder));
      }

      return { previous };
    },
    onError: (_error, _variables, context) => {
      const hasSnapshot = context?.previous !== undefined;
      if (hasSnapshot) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: invalidateTasks,
  });
}
