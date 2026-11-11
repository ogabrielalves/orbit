import {
  type BackupFile,
  commands,
  type ExportBackupInput,
  type ImportBackupInput,
  type ImportReport,
} from "@/bindings";
import { unwrapResult } from "@/lib/unwrapResult";

export async function exportDatabase(input: ExportBackupInput): Promise<BackupFile> {
  return unwrapResult(await commands.exportDatabase(input));
}

export async function importDatabase(input: ImportBackupInput): Promise<ImportReport> {
  return unwrapResult(await commands.importDatabase(input));
}
