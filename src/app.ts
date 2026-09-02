import express, { type ErrorRequestHandler } from "express";

import { createAuthRouter } from "./auth/auth-routes.js";
import { createRequireAuth } from "./auth/require-auth.js";
import type { Database } from "./db.js";
import { createPlaceRouter } from "./places/place-routes.js";
import { createSavedPlaceRouter } from "./saved-places/saved-place-routes.js";

type AppOptions = {
  frontendOrigin: string;
  jwtSecret: string;
};

export function createApp(database: Database, options: AppOptions) {
  const app = express();
  const requireAuth = createRequireAuth(database, options.jwtSecret);

  app.use((request, response, next) => {
    if (request.header("origin") === options.frontendOrigin) {
      response.setHeader("Access-Control-Allow-Origin", options.frontendOrigin);
      response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      response.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      response.setHeader("Vary", "Origin");
    }
    if (request.method === "OPTIONS") {
      response.status(204).end();
      return;
    }
    next();
  });
  app.use(express.json({ limit: "100kb" }));
  app.get("/health", (_request, response) => response.json({ status: "ok" }));
  app.use("/auth", createAuthRouter(database, options.jwtSecret, requireAuth));
  app.use("/places", createPlaceRouter(database));
  app.use("/saved-places", createSavedPlaceRouter(database, requireAuth));
  app.use((_request, response) => response.status(404).json({ message: "요청한 API를 찾을 수 없습니다." }));

  const handleError: ErrorRequestHandler = (error, _request, response, _next) => {
    if (error && typeof error === "object" && "status" in error && error.status === 400) {
      response.status(400).json({ message: "요청 본문의 JSON 형식이 올바르지 않습니다." });
      return;
    }
    console.error(error);
    response.status(500).json({ message: "서버 내부 오류가 발생했습니다." });
  };
  app.use(handleError);

  return app;
}
