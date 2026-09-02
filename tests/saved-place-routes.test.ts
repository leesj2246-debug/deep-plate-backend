import assert from "node:assert/strict";
import express, { type RequestHandler } from "express";
import type { AddressInfo } from "node:net";
import test from "node:test";

import type { Database } from "../src/db.js";
import { createSavedPlaceRouter } from "../src/saved-places/saved-place-routes.js";

test("관심 식당을 최초 저장하고 소프트 삭제한 뒤 같은 행을 복구한다", async () => {
  const restaurant = { id: "place-1", nameKo: "검증용 식당", deletedAt: null };
  type SavedPlaceState = { id: string; userId: string; restaurantId: string; deletedAt: Date | null };
  const state: { savedPlace: SavedPlaceState | null; createCount: number } = { savedPlace: null, createCount: 0 };

  const database = {
    restaurant: {
      findFirst: async () => ({ id: restaurant.id }),
    },
    savedPlace: {
      findUnique: async () => state.savedPlace,
      create: async () => {
        state.createCount += 1;
        state.savedPlace = { id: "saved-1", userId: "user-1", restaurantId: restaurant.id, deletedAt: null };
        return { ...state.savedPlace, restaurant };
      },
      update: async () => {
        if (!state.savedPlace) throw new Error("복구할 저장 항목이 없습니다.");
        state.savedPlace = { ...state.savedPlace, deletedAt: null };
        return { ...state.savedPlace, restaurant };
      },
      updateMany: async (args: { data: { deletedAt: Date } }) => {
        if (!state.savedPlace || state.savedPlace.deletedAt) return { count: 0 };
        state.savedPlace = { ...state.savedPlace, deletedAt: args.data.deletedAt };
        return { count: 1 };
      },
    },
  } as unknown as Database;

  const requireAuth: RequestHandler = (_request, response, next) => {
    response.locals.userId = "user-1";
    next();
  };
  const app = express();
  app.use(express.json());
  app.use("/saved-places", createSavedPlaceRouter(database, requireAuth));
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;

  try {
    const firstSave = await fetch(`http://127.0.0.1:${port}/saved-places/${restaurant.id}`, { method: "POST" });
    assert.equal(firstSave.status, 201);
    assert.equal((await firstSave.json() as { id: string }).id, "saved-1");
    assert.equal(state.createCount, 1);

    const remove = await fetch(`http://127.0.0.1:${port}/saved-places/${restaurant.id}`, { method: "DELETE" });
    assert.equal(remove.status, 204);
    assert.ok(state.savedPlace?.deletedAt instanceof Date);

    const restore = await fetch(`http://127.0.0.1:${port}/saved-places/${restaurant.id}`, { method: "POST" });
    assert.equal(restore.status, 200);
    assert.equal((await restore.json() as { id: string }).id, "saved-1");
    assert.equal(state.savedPlace?.deletedAt, null);
    assert.equal(state.createCount, 1);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
