type CommandResult<TData, TError> =
  | { status: "ok"; data: TData }
  | { status: "error"; error: TError };

export function unwrapResult<TData, TError>(result: CommandResult<TData, TError>): TData {
  const isFailure = result.status === "error";
  if (isFailure) {
    throw result.error;
  }
  return result.data;
}
