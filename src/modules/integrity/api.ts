import { commands, type DatabaseStatus } from "@/bindings";
import { unwrapResult } from "@/lib/unwrapResult";

export async function fetchDatabaseStatus(): Promise<DatabaseStatus> {
  return unwrapResult(await commands.getDatabaseStatus());
}
