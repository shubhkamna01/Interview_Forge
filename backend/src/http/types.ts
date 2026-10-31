export type Role = "candidate" | "interviewer" | "coordinator";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  skills: string[];
}

declare module "express-serve-static-core" {
  interface Request {
    user?: AuthUser;
  }
}
