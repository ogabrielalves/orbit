import { type Comment, type CreateCommentInput, commands } from "@/bindings";
import { unwrapResult } from "@/lib/unwrapResult";

export async function fetchComments(taskId: string): Promise<Comment[]> {
  return unwrapResult(await commands.listComments(taskId));
}

export async function createComment(input: CreateCommentInput): Promise<Comment> {
  return unwrapResult(await commands.createComment(input));
}

export async function updateComment(id: string, body: string): Promise<Comment> {
  return unwrapResult(await commands.updateComment(id, body));
}

export async function deleteComment(id: string): Promise<null> {
  return unwrapResult(await commands.deleteComment(id));
}
