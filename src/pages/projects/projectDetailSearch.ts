import { type NewParam, parseNewParam } from "@/lib/newParam";

export type ProjectDetailSearch = {
  new?: NewParam;
};

export function parseProjectDetailSearch(raw: Record<string, unknown>): ProjectDetailSearch {
  return { new: parseNewParam(raw.new) };
}
