import { commands, type DashboardSummary, type DashboardSummaryInput } from "@/bindings";
import { unwrapResult } from "@/lib/unwrapResult";

export async function fetchDashboardSummary(
  input: DashboardSummaryInput,
): Promise<DashboardSummary> {
  return unwrapResult(await commands.getDashboardSummary(input));
}
