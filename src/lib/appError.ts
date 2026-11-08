import type { ErrorPayload } from "@/bindings";

export type ErrorMessageKey =
  | "errors.unknown"
  | "errors.notFound"
  | "errors.validation"
  | "errors.conflict"
  | "errors.invalidMove"
  | "errors.io"
  | "errors.database";

const messageKeyByCode: Record<string, ErrorMessageKey> = {
  NOT_FOUND: "errors.notFound",
  VALIDATION: "errors.validation",
  CONFLICT: "errors.conflict",
  INVALID_MOVE: "errors.invalidMove",
  IO: "errors.io",
  DATABASE: "errors.database",
};

export function isAppError(value: unknown): value is ErrorPayload {
  const isObject = typeof value === "object" && value !== null;
  if (!isObject) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const hasCode = typeof candidate.code === "string";
  const hasMessage = typeof candidate.message === "string";
  return hasCode && hasMessage;
}

export function getErrorMessageKey(error: unknown): ErrorMessageKey {
  const isKnownShape = isAppError(error);
  if (!isKnownShape) {
    return "errors.unknown";
  }

  return messageKeyByCode[error.code] ?? "errors.unknown";
}
