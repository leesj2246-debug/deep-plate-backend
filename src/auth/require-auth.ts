import type { RequestHandler } from "express";

import type { Database } from "../db.js";
import { verifyAccessToken } from "./auth-security.js";

export function createRequireAuth(database: Database, jwtSecret: string): RequestHandler {
  return async (request, response, next) => {
    const authorization = request.header("authorization");
    const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : null;
    const userId = token ? verifyAccessToken(token, jwtSecret) : null;

    if (!userId) {
      response.status(401).json({ message: "로그인이 필요합니다." });
      return;
    }

    try {
      const user = await database.user.findFirst({
        where: { id: userId, deletedAt: null },
        select: { id: true },
      });
      if (!user) {
        response.status(401).json({ message: "로그인 정보가 만료되었습니다." });
        return;
      }

      response.locals.userId = user.id;
      next();
    } catch (error) {
      next(error);
    }
  };
}
