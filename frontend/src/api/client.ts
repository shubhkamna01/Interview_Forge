import { API_URL } from "./config";
import { getToken } from "./tokenStorage";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

let onUnauthorized: (() => void) | null = null;

/** AuthProvider registers this so an expired session signs the user out everywhere. */
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json", ...options.headers };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check that the backend is running and try again.");
  }

  // A 401 while holding a token means the session ended. (Login's own 401 has no token yet.)
  if (res.status === 401 && token) onUnauthorized?.();

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data: unknown = await res.json();
      if (data && typeof data === "object" && "message" in data && typeof data.message === "string") {
        message = data.message;
      }
    } catch {
      /* not JSON: keep the generic message */
    }
    throw new ApiError(res.status, message);
  }
  return res;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await send(path, options);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Fetches a file with the login token and saves it, since a plain link can't send the token. */
export async function download(path: string, fallbackName: string): Promise<void> {
  const res = await send(path, { headers: { Accept: "*/*" } });
  const blob = await res.blob();
  const match = /filename="?([^";]+)"?/.exec(res.headers.get("Content-Disposition") ?? "");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = match?.[1] ?? fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}
