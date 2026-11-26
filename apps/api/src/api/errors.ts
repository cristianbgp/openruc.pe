export type ApiErrorCode =
  | "INVALID_RUC"
  | "RUC_NOT_FOUND"
  | "RATE_LIMITED"
  | "DATABASE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export function errorBody(
  code: ApiErrorCode,
  message: string,
  requestId: string,
) {
  return { error: { code, message, requestId } } as const;
}
