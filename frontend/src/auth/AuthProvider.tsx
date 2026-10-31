import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setUnauthorizedHandler, type User } from "../api";
import { clearToken, getToken, setToken } from "../api/tokenStorage";
import { AuthContext, type SignupInput } from "./AuthContext";
import { ROLE_LABEL, type Role } from "./roles";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState<boolean>(() => getToken() !== null);

  const logout = useCallback(() => {
    clearToken();
    window.location.hash = "";
    setUser(null);
  }, []);

  // Any 401 from the server (expired or revoked session) signs the user out.
  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  // On page load, ask the server who the saved token belongs to.
  useEffect(() => {
    if (getToken() === null) return;
    let cancelled = false;
    api.auth
      .me()
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch(() => clearToken())
      .finally(() => {
        if (!cancelled) setRestoring(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const start = useCallback((token: string, next: User) => {
    setToken(token);
    window.location.hash = "";
    setUser(next);
  }, []);

  const login = useCallback(
    async (email: string, password: string, role: Role) => {
      const res = await api.auth.login(email, password, role);
      if (res.user.role !== role) {
        throw new Error(`This is not a ${ROLE_LABEL[role]} account. Pick the right role above.`);
      }
      start(res.token, res.user);
    },
    [start],
  );

  const signup = useCallback(
    async (input: SignupInput) => {
      const res = await api.auth.signup(input);
      start(res.token, res.user);
    },
    [start],
  );

  const value = useMemo(
    () => ({ user, restoring, login, signup, logout, setUser }),
    [user, restoring, login, signup, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
