import { Router, type RequestHandler } from "express";

import type { Database } from "../db.js";
import { InputError } from "../input-error.js";
import { parseLoginInput, parseRegisterInput } from "./auth-input.js";
import { createAccessToken, hashPassword, verifyPassword } from "./auth-security.js";

const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  createdAt: true,
} as const;

function isUniqueConstraintError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "P2002");
}

export function createAuthRouter(database: Database, jwtSecret: string, requireAuth: RequestHandler): Router {
  const router = Router();

  router.post("/register", async (request, response) => {
    try {
      const input = parseRegisterInput(request.body);
      const existingUser = await database.user.findUnique({ where: { email: input.email }, select: { id: true } });
      if (existingUser) {
        response.status(409).json({ message: "이미 가입된 이메일입니다." });
        return;
      }

      const user = await database.user.create({
        data: {
          name: input.name,
          email: input.email,
          passwordHash: await hashPassword(input.password),
        },
        select: publicUserSelect,
      });
      response.status(201).json({ user, token: createAccessToken(user.id, jwtSecret) });
    } catch (error) {
      if (error instanceof InputError) {
        response.status(400).json({ message: error.message });
        return;
      }
      if (isUniqueConstraintError(error)) {
        response.status(409).json({ message: "이미 가입된 이메일입니다." });
        return;
      }
      throw error;
    }
  });

  router.post("/login", async (request, response) => {
    try {
      const input = parseLoginInput(request.body);
      const user = await database.user.findFirst({
        where: { email: input.email, deletedAt: null },
      });
      if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
        response.status(401).json({ message: "이메일 또는 비밀번호가 올바르지 않습니다." });
        return;
      }

      const { passwordHash: _passwordHash, deletedAt: _deletedAt, updatedAt: _updatedAt, ...publicUser } = user;
      response.json({ user: publicUser, token: createAccessToken(user.id, jwtSecret) });
    } catch (error) {
      if (error instanceof InputError) {
        response.status(400).json({ message: error.message });
        return;
      }
      throw error;
    }
  });

  router.get("/me", requireAuth, async (_request, response) => {
    const user = await database.user.findUnique({
      where: { id: response.locals.userId as string },
      select: publicUserSelect,
    });
    response.json(user);
  });

  return router;
}
