import { commands, type SearchInput, type SearchResults } from "@/bindings";
import { unwrapResult } from "@/lib/unwrapResult";

export async function fetchSearch(input: SearchInput): Promise<SearchResults> {
  return unwrapResult(await commands.search(input));
}
