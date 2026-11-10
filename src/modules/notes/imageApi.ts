import { commands, type PastedImage, type VaultImage } from "@/bindings";
import { unwrapResult } from "@/lib/unwrapResult";

export async function savePastedImage(noteId: string, data: number[]): Promise<PastedImage> {
  return unwrapResult(await commands.savePastedImage({ noteId, data }));
}

export async function fetchVaultImage(path: string): Promise<VaultImage> {
  return unwrapResult(await commands.readVaultImage(path));
}
