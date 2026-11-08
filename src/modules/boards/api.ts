import {
  type Board,
  type BoardColumn,
  type BoardDetails,
  type CreateBoardInput,
  type CreateColumnInput,
  commands,
  type UpdateBoardInput,
  type UpdateColumnInput,
} from "@/bindings";
import { unwrapResult } from "@/lib/unwrapResult";

export async function fetchBoard(id: string): Promise<BoardDetails> {
  return unwrapResult(await commands.getBoard(id));
}

export async function createBoard(input: CreateBoardInput): Promise<BoardDetails> {
  return unwrapResult(await commands.createBoard(input));
}

export async function updateBoard(id: string, input: UpdateBoardInput): Promise<Board> {
  return unwrapResult(await commands.updateBoard(id, input));
}

export async function deleteBoard(id: string): Promise<null> {
  return unwrapResult(await commands.deleteBoard(id));
}

export async function createColumn(input: CreateColumnInput): Promise<BoardColumn> {
  return unwrapResult(await commands.createColumn(input));
}

export async function updateColumn(id: string, input: UpdateColumnInput): Promise<BoardColumn> {
  return unwrapResult(await commands.updateColumn(id, input));
}

export async function moveColumn(id: string, afterColumnId: string | null): Promise<BoardColumn> {
  return unwrapResult(await commands.moveColumn(id, afterColumnId));
}

export async function deleteColumn(id: string): Promise<null> {
  return unwrapResult(await commands.deleteColumn(id));
}
