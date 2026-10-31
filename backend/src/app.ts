import cors from "cors";
import express from "express";
import helmet from "helmet";
import { config } from "./config";
import { pool } from "./db/pool";
import { errorHandler } from "./http/middleware";
import { notFound } from "./http/errors";
import { authRouter } from "./routes/auth";
import { drivesRouter } from "./routes/drives";
import { interviewsRouter, meRouter } from "./routes/interviews";
import { notificationsRouter } from "./routes/notifications";
import { roomsRouter } from "./routes/rooms";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxy > 0) app.set("trust proxy", config.trustProxy);

  app.use(helmet());
  app.use(
    cors({
      origin: config.corsOrigins,
      allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key"],
      exposedHeaders: ["Content-Disposition"],
    }),
  );
  app.use(express.json({ limit: "100kb" }));

  app.get("/api/health", async (_req, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/drives", drivesRouter);
  app.use("/api/interviews", interviewsRouter);
  app.use("/api/me", meRouter);
  app.use("/api/rooms", roomsRouter);
  app.use("/api/notifications", notificationsRouter);

  app.use("/api", () => {
    throw notFound("That endpoint doesn't exist.");
  });
  app.use(errorHandler);
  return app;
}
