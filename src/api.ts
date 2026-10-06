import type { ApiErrorBody, ReadResponses } from "../shared/contracts.ts";
type ApiOptions = Omit<RequestInit, "body"> & { body?: unknown };
let refreshing: Promise<Response> | null = null;
export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}
export function api<P extends keyof ReadResponses>(
  path: P,
  options?: ApiOptions,
  retry?: boolean,
): Promise<ReadResponses[P]>;
export function api<T = unknown>(
  path: string,
  options?: ApiOptions,
  retry?: boolean,
): Promise<T>;
export async function api(
  path: string,
  options: ApiOptions = {},
  retry = true,
): Promise<unknown> {
  const isForm = options.body instanceof FormData;
  const headers = new Headers(options.headers);
  if (!isForm && options.body && !headers.has("Content-Type"))
    headers.set("Content-Type", "application/json");
  const res = await fetch(`/api/v1${path}`, {
    credentials: "same-origin",
    ...options,
    headers,
    body: options.body
      ? isForm
        ? (options.body as FormData)
        : JSON.stringify(options.body)
      : undefined,
  });
  if (res.status === 401 && retry && !path.startsWith("/auth/")) {
    refreshing ||= fetch("/api/v1/auth/refresh", {
      method: "POST",
      credentials: "same-origin",
    }).finally(() => {
      refreshing = null;
    });
    const refresh = await refreshing;
    if (refresh.ok) return api(path, options, false);
  }
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/auth/"))
      window.dispatchEvent(new Event("ft-session-expired"));
    const error = (body as Partial<ApiErrorBody> | null)?.error;
    if (error?.code === "MFA_REQUIRED")
      window.dispatchEvent(new Event("ft-mfa-required"));
    throw new ApiError(
      error?.message || "The server could not complete this request.",
      res.status,
      error?.code,
    );
  }
  return body;
}
