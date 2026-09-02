import { Router } from "express";

import type { Database } from "../db.js";
import { InputError } from "../input-error.js";
import { parseCreateCustomerInput, parseDeleteCustomerInput } from "./customer-input.js";

export function createCustomerRouter(database: Database): Router {
  const router = Router();

  router.post("/", async (request, response) => {
    try {
      const input = parseCreateCustomerInput(request.body);
      const customer = await database.customer.create({ data: input });
      response.status(201).json(customer);
    } catch (error) {
      if (error instanceof InputError) {
        response.status(400).json({ message: error.message });
        return;
      }
      throw error;
    }
  });

  router.get("/", async (_request, response) => {
    const customers = await database.customer.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
    });
    response.json(customers);
  });

  router.get("/trash", async (_request, response) => {
    const customers = await database.customer.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
    });
    response.json(customers);
  });

  router.get("/:id", async (request, response) => {
    const customer = await database.customer.findFirst({
      where: { id: request.params.id, deletedAt: null },
    });
    if (!customer) {
      response.status(404).json({ message: "고객을 찾을 수 없습니다." });
      return;
    }
    response.json(customer);
  });

  router.delete("/:id", async (request, response) => {
    try {
      const input = parseDeleteCustomerInput(request.body);
      const result = await database.customer.updateMany({
        where: { id: request.params.id, deletedAt: null },
        data: { deletedAt: new Date(), ...input },
      });
      if (result.count === 0) {
        response.status(404).json({ message: "삭제할 고객을 찾을 수 없습니다." });
        return;
      }
      response.status(204).end();
    } catch (error) {
      if (error instanceof InputError) {
        response.status(400).json({ message: error.message });
        return;
      }
      throw error;
    }
  });

  router.post("/:id/restore", async (request, response) => {
    const result = await database.customer.updateMany({
      where: { id: request.params.id, deletedAt: { not: null } },
      data: { deletedAt: null, deletedBy: null, deleteReason: null },
    });
    if (result.count === 0) {
      response.status(404).json({ message: "복구할 고객을 찾을 수 없습니다." });
      return;
    }

    const customer = await database.customer.findUniqueOrThrow({ where: { id: request.params.id } });
    response.json(customer);
  });

  return router;
}
