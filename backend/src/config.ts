import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(0).default(8000),
  DATABASE_URL: z.string().optional(),
  DATABASE_SSL: z.enum(["true", "false"]).default("false"),
  DB_POOL_MAX: z.coerce.number().int().min(1).default(10),
  JWT_SECRET: z.string().optional(),
  JWT_EXPIRES_IN: z.string().default("7d"),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  COORDINATOR_SIGNUP_CODE: z.string().optional(),
  APP_TIMEZONE: z.string().default("Asia/Kolkata"),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(20),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
});

const env = schema.parse(process.env);

if (env.NODE_ENV === "production" && (env.JWT_SECRET ?? "").length < 32) {
  throw new Error("JWT_SECRET must be set to a random string of at least 32 characters in production.");
}

export const config = {
  env: env.NODE_ENV,
  isProduction: env.NODE_ENV === "production",
  port: env.PORT,
  databaseUrl: env.DATABASE_URL || undefined,
  databaseSsl: env.DATABASE_SSL === "true",
  dbPoolMax: env.DB_POOL_MAX,
  // The fallback is only ever used outside production (checked above).
  jwtSecret: env.JWT_SECRET || "dev-only-secret-change-me",
  jwtExpiresIn: env.JWT_EXPIRES_IN,
  corsOrigins: env.CORS_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean),
  coordinatorSignupCode: env.COORDINATOR_SIGNUP_CODE || undefined,
  appTimezone: env.APP_TIMEZONE,
  authRateLimitMax: env.AUTH_RATE_LIMIT_MAX,
  trustProxy: env.TRUST_PROXY,
};
