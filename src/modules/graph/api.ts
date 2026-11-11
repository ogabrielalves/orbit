import { commands, type Graph, type GraphInput, type LocalGraphInput } from "@/bindings";
import { unwrapResult } from "@/lib/unwrapResult";

export async function fetchGraph(input: GraphInput): Promise<Graph> {
  return unwrapResult(await commands.getGraph(input));
}

export async function fetchLocalGraph(input: LocalGraphInput): Promise<Graph> {
  return unwrapResult(await commands.getLocalGraph(input));
}
