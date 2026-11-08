import { commands, type Settings, type UpdateSettingsInput } from "@/bindings";
import { unwrapResult } from "@/lib/unwrapResult";

export async function fetchSettings(): Promise<Settings> {
  return unwrapResult(await commands.getSettings());
}

export async function saveSettings(input: UpdateSettingsInput): Promise<Settings> {
  return unwrapResult(await commands.updateSettings(input));
}
