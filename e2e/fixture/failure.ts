import type { ErrorPayload } from "@/bindings";

export function fail(code: string, message: string): never {
  const payload: ErrorPayload = { code, message };
  throw payload;
}
