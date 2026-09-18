import { randomUUID } from "node:crypto";

import type { Database } from "../db.js";
import type { PaymentOrder } from "../generated/prisma/client.js";
import type { PaymentConfig } from "./payment-config.js";
import { PaymentError } from "./payment-input.js";
import { createTossGateway, GatewayError, isDefinitiveKeyError, type PaymentGateway } from "./toss-gateway.js";

export const testProduct = Object.freeze({
  id: "curation-demo",
  name: "Deep Plate 1:1 큐레이션 신청 결제",
  amount: 10_000,
  currency: "KRW",
});

export function publicOrder(order: PaymentOrder) {
  return {
    id: order.id,
    productId: order.productId,
    name: order.name,
    amount: order.amount,
    currency: order.currency,
    status: order.status,
    mode: order.mode,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    failureCode: order.failureCode,
  };
}

const uncertain = () => new PaymentError(502, "PAYMENT_UNCERTAIN", "승인 결과를 확인 중입니다. 새 주문 대신 이 주문의 상태 확인을 다시 눌러 주세요.");
const processing = () => new PaymentError(409, "PAYMENT_PROCESSING", "이 주문의 승인을 확인 중입니다. 잠시 후 같은 주문을 다시 확인해 주세요.");
type OrderOwner = { userId: string } | { guestOrderId: string };

function ownerWhere(owner: OrderOwner) {
  return "userId" in owner ? { userId: owner.userId } : { id: owner.guestOrderId, userId: null };
}

export function createPaymentService(database: Database, config: PaymentConfig, gateway?: PaymentGateway) {
  const provider = gateway ?? (config.mode === "toss-test" ? createTossGateway(config.secretKey ?? "") : undefined);

  function enabled() {
    if (config.mode === "disabled") throw new PaymentError(503, "PAYMENTS_DISABLED", "테스트 결제가 아직 준비되지 않았습니다.");
  }

  async function verifiedApplication(applicationSubmissionId: string) {
    enabled();
    if (!config.tallyFormId || !config.tallySigningSecret) {
      throw new PaymentError(503, "APPLICATION_VERIFICATION_UNAVAILABLE", "신청 확인 기능이 아직 준비되지 않았습니다.");
    }
    const submission = await database.curationSubmission.findFirst({
      where: { id: applicationSubmissionId, formId: config.tallyFormId },
    });
    if (!submission) {
      throw new PaymentError(409, "APPLICATION_NOT_VERIFIED", "신청 접수를 확인 중입니다. 잠시 후 같은 신청으로 다시 시도해 주세요.");
    }
  }

  async function ownedOrder(owner: OrderOwner, orderId: string) {
    const order = await database.paymentOrder.findFirst({ where: { id: orderId, ...ownerWhere(owner) } });
    if (!order) throw new PaymentError(404, "ORDER_NOT_FOUND", "주문을 찾을 수 없습니다.");
    return order;
  }

  async function createOrder(userId: string, productId: string) {
    enabled();
    if (productId !== testProduct.id) throw new PaymentError(400, "UNKNOWN_PRODUCT", "선택한 테스트 상품이 없습니다.");
    const unresolved = await database.paymentOrder.findFirst({ where: { userId, status: "CONFIRMING" } });
    if (unresolved) throw processing();
    return publicOrder(await database.paymentOrder.create({
      data: {
        userId,
        applicationSubmissionId: null,
        productId: testProduct.id,
        name: testProduct.name,
        amount: testProduct.amount,
        currency: testProduct.currency,
        mode: config.mode,
      },
    }));
  }

  async function createGuestOrder(applicationSubmissionId: string, productId: string) {
    await verifiedApplication(applicationSubmissionId);
    if (productId !== testProduct.id) throw new PaymentError(400, "UNKNOWN_PRODUCT", "선택한 테스트 상품이 없습니다.");
    const existing = await database.paymentOrder.findFirst({ where: { applicationSubmissionId } });
    if (existing) return publicOrder(existing);
    try {
      return publicOrder(await database.paymentOrder.create({
        data: {
          userId: null,
          applicationSubmissionId,
          productId: testProduct.id,
          name: testProduct.name,
          amount: testProduct.amount,
          currency: testProduct.currency,
          mode: config.mode,
        },
      }));
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        const concurrent = await database.paymentOrder.findFirst({ where: { applicationSubmissionId } });
        if (concurrent) return publicOrder(concurrent);
      }
      throw error;
    }
  }

  // Only matching provider data can move an order to a terminal state.
  function readPayment(value: unknown, order: PaymentOrder, paymentKey: string) {
    if (!value || typeof value !== "object") throw uncertain();
    const payment = value as Record<string, unknown>;
    if (payment.paymentKey !== paymentKey || payment.orderId !== order.id || payment.totalAmount !== order.amount || payment.currency !== order.currency || payment.type !== "NORMAL") {
      throw new PaymentError(502, "PAYMENT_REVIEW_REQUIRED", "결제사 정보가 주문과 일치하지 않아 완료 처리하지 않았습니다. 기존 주문 상태를 확인해 주세요.");
    }
    if (payment.status === "DONE") {
      if (typeof payment.approvedAt !== "string" || !Number.isFinite(Date.parse(payment.approvedAt))) throw uncertain();
      if (payment.method !== "카드" && payment.method !== "간편결제") {
        throw new PaymentError(502, "PAYMENT_REVIEW_REQUIRED", "지원하지 않는 결제수단입니다. 주문 상태 확인이 필요합니다.");
      }
      return { status: "PAID" as const, paidAt: new Date(payment.approvedAt) };
    }
    if (["ABORTED", "EXPIRED", "CANCELED"].includes(String(payment.status))) {
      return { status: "FAILED" as const, paidAt: null };
    }
    return null;
  }

  async function confirmOwned(owner: OrderOwner, input: { orderId: string; paymentKey: string; amount: number }) {
    const order = await ownedOrder(owner, input.orderId);
    if (order.amount !== input.amount) throw new PaymentError(400, "AMOUNT_MISMATCH", "주문 금액과 결제 금액이 일치하지 않습니다.");
    if (order.paymentKey && order.paymentKey !== input.paymentKey) throw new PaymentError(409, "PAYMENT_KEY_MISMATCH", "이 주문에 연결된 결제 식별값과 다릅니다.");
    if (order.status === "PAID") return publicOrder(order);
    if (order.status === "FAILED") throw new PaymentError(409, "PAYMENT_DECLINED", "결제사에서 실패 또는 취소가 확인된 주문입니다.");
    enabled();
    if (order.mode !== config.mode) throw new PaymentError(409, "PAYMENT_MODE_CHANGED", "주문 당시 테스트 모드와 현재 설정이 달라 확인할 수 없습니다.");
    if ((order.mode === "mock" && input.paymentKey !== `mock_${order.id}`) || (order.mode === "toss-test" && input.paymentKey.startsWith("mock_"))) {
      throw new PaymentError(400, "INVALID_PAYMENT_KEY", "현재 테스트 모드에 맞지 않는 결제 식별값입니다.");
    }

    const leaseToken = randomUUID();
    const now = new Date();
    // Atomic DB compare-and-set works across concurrent requests/serverless instances.
    const claim = await database.paymentOrder.updateMany({
      where: {
        id: order.id,
        ...ownerWhere(owner),
        status: { in: ["PENDING", "CONFIRMING"] },
        AND: [
          { OR: [{ paymentKey: null }, { paymentKey: input.paymentKey }] },
          { OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] },
        ],
      },
      data: { status: "CONFIRMING", paymentKey: input.paymentKey, leaseToken, leaseUntil: new Date(now.getTime() + 45_000), failureCode: null },
    }).catch((error: unknown) => {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        throw new PaymentError(409, "PAYMENT_KEY_REUSED", "이미 다른 주문에 연결된 결제 식별값입니다.");
      }
      throw error;
    });
    if (claim.count === 0) {
      const current = await ownedOrder(owner, order.id);
      if (current.status === "PAID" && current.paymentKey === input.paymentKey) return publicOrder(current);
      throw processing();
    }

    async function settle(result: { status: "PAID" | "FAILED"; paidAt: Date | null }) {
      const saved = await database.paymentOrder.updateMany({
        where: { id: order.id, leaseToken, status: "CONFIRMING" },
        data: { ...result, failureCode: result.status === "FAILED" ? "PAYMENT_DECLINED" : null, leaseToken: null, leaseUntil: null },
      });
      if (saved.count === 0) throw processing();
      if (result.status === "FAILED") throw new PaymentError(422, "PAYMENT_DECLINED", "결제사에서 결제 실패 또는 취소가 확인되었습니다.");
      return publicOrder(await ownedOrder(owner, order.id));
    }

    async function inspectProvider() {
      if (!provider) throw uncertain();
      try {
        return { result: readPayment(await provider.find(input.paymentKey), order, input.paymentKey), notFound: false };
      } catch (error) {
        if (error instanceof GatewayError && error.kind === "not-found" && error.providerCode === "NOT_FOUND_PAYMENT" && error.httpStatus === 404) {
          return { result: null, notFound: true };
        }
        throw error;
      }
    }

    try {
      if (order.mode === "mock") return await settle({ status: "PAID", paidAt: new Date() });
      if (!provider) throw uncertain();

      // After a timeout/crash, query first; never change either paymentKey or idempotencyKey.
      if (order.status === "CONFIRMING") {
        const recovered = await inspectProvider();
        if (recovered.result) return await settle(recovered.result);
        // Toss's idempotency retention is 15 days. Old ambiguous orders are lookup-only.
        if (Date.now() - order.createdAt.getTime() >= 14 * 24 * 60 * 60 * 1_000) {
          throw new PaymentError(409, "PAYMENT_REVIEW_REQUIRED", "오래된 주문의 승인 상태를 운영자가 확인해야 합니다.");
        }
      }

      let result: unknown;
      try {
        result = await provider.confirm({ ...input, idempotencyKey: order.idempotencyKey });
      } catch (error) {
        // Even a 4xx can follow an already-completed request: query before declaring failure.
        const recovered = await inspectProvider();
        if (recovered.result) return await settle(recovered.result);
        // Only a first attempt with two independent definitive signals may fail closed.
        // Prior ambiguous attempts remain recoverable even if the payment later cannot be found.
        if (order.status === "PENDING" && recovered.notFound && isDefinitiveKeyError(error)) {
          return await settle({ status: "FAILED", paidAt: null });
        }
        throw uncertain();
      }
      const settled = readPayment(result, order, input.paymentKey);
      if (settled) return await settle(settled);
      throw uncertain();
    } catch (error) {
      const safeError = error instanceof PaymentError ? error : uncertain();
      await database.paymentOrder.updateMany({
        where: { id: order.id, leaseToken, status: "CONFIRMING" },
        data: { failureCode: safeError.code },
      });
      throw safeError;
    } finally {
      // A crashed invocation releases via expiry. A delayed old invocation cannot release a new lease.
      await database.paymentOrder.updateMany({ where: { id: order.id, leaseToken }, data: { leaseToken: null, leaseUntil: null } });
    }
  }

  return {
    product: () => {
      const available = config.mode !== "disabled" && Boolean(config.tallyFormId && config.tallySigningSecret);
      return {
        product: testProduct,
        mode: available ? config.mode : "disabled",
        available,
        ...(available && config.mode === "toss-test" ? { clientKey: config.clientKey } : {}),
      };
    },
    createOrder,
    createGuestOrder,
    getOrder: async (userId: string, orderId: string) => publicOrder(await ownedOrder({ userId }, orderId)),
    listOrders: async (userId: string) => (await database.paymentOrder.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 50 })).map(publicOrder),
    confirm: (userId: string, input: { orderId: string; paymentKey: string; amount: number }) => confirmOwned({ userId }, input),
    confirmGuest: (input: { orderId: string; paymentKey: string; amount: number }) => confirmOwned({ guestOrderId: input.orderId }, input),
    reconcile: async (userId: string, orderId: string) => {
      const order = await ownedOrder({ userId }, orderId);
      if (order.status === "PAID" || order.status === "FAILED" || !order.paymentKey) return publicOrder(order);
      return confirmOwned({ userId }, { orderId, amount: order.amount, paymentKey: order.paymentKey });
    },
    reconcileGuest: async (orderId: string) => {
      const owner = { guestOrderId: orderId };
      const order = await ownedOrder(owner, orderId);
      if (order.status === "PAID" || order.status === "FAILED" || !order.paymentKey) return publicOrder(order);
      return confirmOwned(owner, { orderId, amount: order.amount, paymentKey: order.paymentKey });
    },
  };
}
