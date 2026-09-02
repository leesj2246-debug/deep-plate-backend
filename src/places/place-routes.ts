import { Router } from "express";

import type { Database } from "../db.js";
import { InputError } from "../input-error.js";
import { parsePlaceFilters } from "./place-input.js";

export function createPlaceRouter(database: Database): Router {
  const router = Router();

  router.get("/", async (request, response) => {
    try {
      const filters = parsePlaceFilters(request.query);
      const places = await database.restaurant.findMany({
        where: {
          deletedAt: null,
          ...(filters.area && { area: { equals: filters.area, mode: "insensitive" } }),
          ...(filters.category && { category: { equals: filters.category, mode: "insensitive" } }),
          ...(filters.budget !== undefined && { minBudget: { lte: filters.budget } }),
        },
        orderBy: { createdAt: "desc" },
      });
      response.json(places);
    } catch (error) {
      if (error instanceof InputError) {
        response.status(400).json({ message: error.message });
        return;
      }
      throw error;
    }
  });

  router.get("/:slug", async (request, response) => {
    const place = await database.restaurant.findFirst({
      where: { slug: request.params.slug, deletedAt: null },
    });
    if (!place) {
      response.status(404).json({ message: "식당을 찾을 수 없습니다." });
      return;
    }
    response.json(place);
  });

  return router;
}
