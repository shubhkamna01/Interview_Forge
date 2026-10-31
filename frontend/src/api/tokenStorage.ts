const KEY = "interviewforge.token";

export function getToken(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(KEY, token);
  } catch {
    /* storage blocked: the session just won't survive a refresh */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
