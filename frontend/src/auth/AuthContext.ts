import { createContext } from "react";
import type { User } from "../api";
import type { Role } from "./roles";

export interface SignupInput {
  name: string;
  email: string;
  password: string;
  role: Role;
  accessCode?: string;
}

export interface AuthContextValue {
  user: User | null;
  /** True while a saved token is being checked with the server on page load. */
  restoring: boolean;
  login: (email: string, password: string, role: Role) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
  logout: () => void;
  /** Replace the stored user, e.g. after editing the profile. */
  setUser: (user: User) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
