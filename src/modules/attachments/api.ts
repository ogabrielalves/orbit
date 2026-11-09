import { type Attachment, commands } from "@/bindings";
import { unwrapResult } from "@/lib/unwrapResult";

export async function fetchAttachments(taskId: string): Promise<Attachment[]> {
  return unwrapResult(await commands.listAttachments(taskId));
}

export async function importAttachment(taskId: string, sourcePath: string): Promise<Attachment> {
  return unwrapResult(await commands.importAttachment(taskId, sourcePath));
}

export async function removeAttachment(id: string): Promise<null> {
  return unwrapResult(await commands.removeAttachment(id));
}

export async function openAttachment(id: string): Promise<null> {
  return unwrapResult(await commands.openAttachment(id));
}
