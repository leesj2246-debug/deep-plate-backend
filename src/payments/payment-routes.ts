import { Router, type RequestHandler } from "express";

import { createCheckoutAccessToken, verifyCheckoutAccessToken } from "../auth/auth-security.js";
import type { Database } from "../db.js";
import type { PaymentConfig } from "./payment-config.js";
import { parseConfirmation, parseGuestCreateOrder, parseOrderId, PaymentError } from "./payment-input.js";
import { createPaymentService } from "./payment-service.js";
import type { PaymentGateway } from "./toss-gateway.js";

export function createPaymentRouter(database: Database, requireAuth: RequestHandler, jwtSecret: string, config: PaymentConfig, gateway?: PaymentGateway): Router {
  const router = Router();
  const service = createPaymentService(database, config, gateway);
  router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });
  router.get("/product", (_request, response) => response.json(service.product()));
  router.post("/guest/orders", async (request, response) => {
    const input = parseGuestCreateOrder(request.body);
    const order = await service.createGuestOrder(input.applicationSubmissionId, input.productId);
    response.status(201).json({ order, checkoutToken: createCheckoutAccessToken(order.id, jwtSecret) });
  });
  router.post("/guest/confirm", async (request, response) => {
    const input = parseConfirmation(request.body);
    const orderId = checkoutOrderId(request.header("x-checkout-token"), jwtSecret);
    if (orderId !== input.orderId) throw new PaymentError(404, "ORDER_NOT_FOUND", "주문을 찾을 수 없습니다.");
    response.json({ order: await service.confirmGuest(input) });
  });
  router.post("/guest/orders/:orderId/reconcile", async (request, response) => {
    const requestedOrderId = parseOrderId(request.params.orderId);
    const orderId = checkoutOrderId(request.header("x-checkout-token"), jwtSecret);
    if (orderId !== requestedOrderId) throw new PaymentError(404, "ORDER_NOT_FOUND", "주문을 찾을 수 없습니다.");
    response.json({ order: await service.reconcileGuest(orderId) });
  });
  router.use(requireAuth);
  router.get("/orders/me", async (_request, response) => {
    response.json({ orders: await service.listOrders(response.locals.userId as string) });
  });
  router.get("/orders/:orderId", async (request, response) => {
    response.json({ order: await service.getOrder(response.locals.userId as string, parseOrderId(request.params.orderId)) });
  });
  router.post("/orders/:orderId/reconcile", async (request, response) => {
    response.json({ order: await service.reconcile(response.locals.userId as string, parseOrderId(request.params.orderId)) });
  });
  router.post("/confirm", async (request, response) => {
    response.json({ order: await service.confirm(response.locals.userId as string, parseConfirmation(request.body)) });
  });
  router.use((error: unknown, _request: Parameters<RequestHandler>[0], response: Parameters<RequestHandler>[1], _next: Parameters<RequestHandler>[2]) => {
    if (error instanceof PaymentError) {
      response.status(error.status).json({ code: error.code, message: error.message });
      return;
    }
    // No request/Prisma/provider objects in logs: they can contain a payment key or secret.
    console.error("Payment operation failed; order state must be checked before retry.");
    response.status(500).json({ code: "PAYMENT_SERVER_ERROR", message: "결제 정보를 처리하지 못했습니다. 기존 주문 내역을 먼저 확인해 주세요." });
  });
  return router;
}

function checkoutOrderId(token: string | undefined, jwtSecret: string): string {
  const orderId = token ? verifyCheckoutAccessToken(token, jwtSecret) : null;
  if (!orderId) throw new PaymentError(401, "CHECKOUT_ACCESS_REQUIRED", "이 브라우저의 비회원 결제 확인 정보가 필요합니다.");
  return orderId;
}
