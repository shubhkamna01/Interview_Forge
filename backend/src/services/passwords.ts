import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config";
import type { Role } from "../http/types";

const COST = config.env === "test" ? 4 : 10;

export const hashPassword = (plain: string) => bcrypt.hash(plain, COST);

// Compared against when the email doesn't exist, so response time doesn't reveal which emails are registered.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", COST);
export const verifyPassword = (plain: string, hash: string | null | undefined) =>
  bcrypt.compare(plain, hash ?? DUMMY_HASH);

export function signToken(userId: string, role: Role): string {
  return jwt.sign({ role }, config.jwtSecret, {
    subject: userId,
    expiresIn: config.jwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

export function verifyToken(token: string): { sub: string; role: Role } {
  const payload = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
  if (typeof payload === "string" || !payload.sub) throw new Error("Bad token");
  return { sub: payload.sub, role: payload.role as Role };
}
