import { commands, type IndexReport } from "@/bindings";
import { unwrapResult } from "@/lib/unwrapResult";

export async function reindexVault(): Promise<IndexReport> {
  return unwrapResult(await commands.reindexVault());
}
