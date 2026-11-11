import type { SearchHit, SearchResults } from "@/bindings";

export const searchCategories = ["projects", "boards", "tasks", "notes", "folders"] as const;

export type SearchCategory = (typeof searchCategories)[number];

export type SearchGroup = {
  category: SearchCategory;
  hits: SearchHit[];
};

export function groupSearchResults(results: SearchResults | undefined): SearchGroup[] {
  if (results === undefined) {
    return [];
  }

  return searchCategories
    .map((category) => ({ category, hits: results[category] }))
    .filter((group) => group.hits.length > 0);
}

export function hitText(parts: SearchHit["title"]): string {
  return parts.map((part) => part.text).join("");
}
