import { Router, type RequestHandler } from "express";

import type { Database } from "../db.js";

export function createSavedPlaceRouter(database: Database, requireAuth: RequestHandler): Router {
  const router = Router();
  router.use(requireAuth);

  router.get("/", async (_request, response) => {
    const savedPlaces = await database.savedPlace.findMany({
      where: {
        userId: response.locals.userId as string,
        deletedAt: null,
        restaurant: { deletedAt: null },
      },
      include: { restaurant: true },
      orderBy: { createdAt: "desc" },
    });
    response.json(savedPlaces);
  });

  router.post("/:placeId", async (request, response) => {
    const userId = response.locals.userId as string;
    const restaurant = await database.restaurant.findFirst({
      where: { id: request.params.placeId, deletedAt: null },
      select: { id: true },
    });
    if (!restaurant) {
      response.status(404).json({ message: "저장할 식당을 찾을 수 없습니다." });
      return;
    }

    const existing = await database.savedPlace.findUnique({
      where: { userId_restaurantId: { userId, restaurantId: restaurant.id } },
    });
    if (existing) {
      const savedPlace = await database.savedPlace.update({
        where: { id: existing.id },
        data: { deletedAt: null },
        include: { restaurant: true },
      });
      response.json(savedPlace);
      return;
    }

    const savedPlace = await database.savedPlace.create({
      data: { userId, restaurantId: restaurant.id },
      include: { restaurant: true },
    });
    response.status(201).json(savedPlace);
  });

  router.delete("/:placeId", async (request, response) => {
    const result = await database.savedPlace.updateMany({
      where: {
        userId: response.locals.userId as string,
        restaurantId: request.params.placeId,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) {
      response.status(404).json({ message: "저장된 식당을 찾을 수 없습니다." });
      return;
    }
    response.status(204).end();
  });

  return router;
}
