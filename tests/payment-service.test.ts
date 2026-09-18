import assert from "node:assert/strict";
import test from "node:test";

import { loadPaymentConfig } from "../src/payments/payment-config.js";
import { parseConfirmation, parseCreateOrder, parseGuestCreateOrder, PaymentError } from "../src/payments/payment-input.js";
import { createPaymentService } from "../src/payments/payment-service.js";
import { createTossGateway, GatewayError, type PaymentGateway } from "../src/payments/toss-gateway.js";
import { paymentDatabase } from "./payment-fixture.js";

const tossConfig = { mode: "toss-test" as const, clientKey: "test_gck_docs_example", secretKey: "test_gsk_docs_example" };
const hasCode = (code: string) => (error: unknown) => error instanceof PaymentError && error.code === code;
const done = (orderId: string, paymentKey = "valid_payment_key") => ({
  paymentKey, orderId, totalAmount: 10_000, currency: "KRW", status: "DONE", type: "NORMAL", method: "카드", approvedAt: "2026-09-18T10:00:00+09:00",
});

test("기본 결제는 비활성화되고 모든 모드에서 실키 및 잘못된 키 조합을 차단한다", () => {
  assert.equal(loadPaymentConfig({}).mode, "disabled");
  assert.deepEqual(loadPaymentConfig({ PAYMENT_MODE: "mock" }).mode, "mock");
  assert.equal(loadPaymentConfig({ PAYMENT_MODE: "toss-test", TOSS_CLIENT_KEY: tossConfig.clientKey, TOSS_SECRET_KEY: tossConfig.secretKey }).mode, "toss-test");
  assert.equal(loadPaymentConfig({ PAYMENT_MODE: "mock", TALLY_FORM_ID: "ZjAlQe", TALLY_SIGNING_SECRET: "secret" }).tallyFormId, "ZjAlQe");
  for (const mode of ["disabled", "mock", "toss-test"]) {
    assert.throws(() => loadPaymentConfig({ PAYMENT_MODE: mode, TOSS_SECRET_KEY: "live_sk_example" }), /테스트/);
    assert.throws(() => loadPaymentConfig({ PAYMENT_MODE: mode, TOSS_CLIENT_KEY: "live_gck_example" }), /테스트/);
  }
  assert.throws(() => loadPaymentConfig({ PAYMENT_MODE: "toss-test" }), /필요/);
  assert.throws(() => loadPaymentConfig({ PAYMENT_MODE: "live" }), /허용/);
  assert.throws(() => loadPaymentConfig({ TOSS_CLIENT_KEY: "test_gck_example", TOSS_SECRET_KEY: "test_sk_example" }), /종류/);
  assert.throws(() => loadPaymentConfig({ TALLY_FORM_ID: "ZjAlQe" }), /함께/);
  assert.throws(() => createTossGateway("live_sk_example"), /테스트/);
});

test("가격 덮어쓰기, 문자열 금액, 과도한 결제키, 배열 입력을 거절한다", () => {
  assert.throws(() => parseCreateOrder({ productId: "curation-demo", amount: 1 }), hasCode("INVALID_PAYMENT_INPUT"));
  assert.throws(() => parseCreateOrder([]), hasCode("INVALID_PAYMENT_INPUT"));
  assert.deepEqual(parseGuestCreateOrder({ productId: "curation-demo", applicationSubmissionId: "tally_submission_123" }), { productId: "curation-demo", applicationSubmissionId: "tally_submission_123" });
  assert.throws(() => parseGuestCreateOrder({ productId: "curation-demo", applicationSubmissionId: "bad value" }), hasCode("INVALID_PAYMENT_INPUT"));
  const input = { orderId: "8477e760-892b-4140-9c16-7d91143ee53e", amount: 10000, paymentKey: "valid" };
  assert.throws(() => parseConfirmation({ ...input, amount: "10000" }), hasCode("INVALID_PAYMENT_INPUT"));
  assert.throws(() => parseConfirmation({ ...input, paymentKey: "a".repeat(201) }), hasCode("INVALID_PAYMENT_INPUT"));
  assert.throws(() => parseConfirmation({ ...input, orderId: "../secrets" }), hasCode("INVALID_PAYMENT_INPUT"));
});

test("mock 승인은 서버 상품 금액을 쓰고 서비스 인스턴스 재생성 뒤 같은 주문을 한 번만 완료한다", async () => {
  const { database, rows } = paymentDatabase();
  const noGateway: PaymentGateway = { confirm: async () => assert.fail("mock must never call Toss"), find: async () => assert.fail("mock must never query Toss") };
  const service = createPaymentService(database, { mode: "mock" }, noGateway);
  const order = await service.createOrder("owner", "curation-demo");
  assert.equal(order.amount, 10000);
  const input = { orderId: order.id, paymentKey: `mock_${order.id}`, amount: 10000 };
  const first = await service.confirm("owner", input);
  const restarted = createPaymentService(database, { mode: "mock" }, noGateway);
  const second = await restarted.confirm("owner", input);
  assert.equal(first.status, "PAID");
  assert.equal(first.mode, "mock");
  assert.deepEqual(second, first);
  assert.equal(rows.size, 1);
  assert.ok(first.paidAt);
  assert.equal("paymentKey" in first, false);
  assert.equal("idempotencyKey" in first, false);
  assert.equal("secretKey" in service.product(), false);
});

test("타인 주문, 금액 변조와 mock 식별값 우회는 승인 전에 차단한다", async () => {
  const { database, rows } = paymentDatabase();
  const service = createPaymentService(database, { mode: "mock" });
  const order = await service.createOrder("owner", "curation-demo");
  const input = { orderId: order.id, paymentKey: `mock_${order.id}`, amount: 10000 };
  await assert.rejects(service.getOrder("other", order.id), hasCode("ORDER_NOT_FOUND"));
  await assert.rejects(service.confirm("other", input), hasCode("ORDER_NOT_FOUND"));
  await assert.rejects(service.confirm("owner", { ...input, amount: 1 }), hasCode("AMOUNT_MISMATCH"));
  await assert.rejects(service.confirm("owner", { ...input, paymentKey: "mock_anything" }), hasCode("INVALID_PAYMENT_KEY"));
  assert.equal(rows.get(order.id)?.status, "PENDING");
  assert.deepEqual(await service.listOrders("other"), []);
});

test("toss-test 주문은 mock 키를 차단하고 다른 모드에서 승인할 수 없다", async () => {
  const { database } = paymentDatabase();
  let calls = 0;
  const gateway: PaymentGateway = { confirm: async () => { calls++; }, find: async () => { calls++; } };
  const toss = createPaymentService(database, tossConfig, gateway);
  const order = await toss.createOrder("owner", "curation-demo");
  await assert.rejects(toss.confirm("owner", { orderId: order.id, paymentKey: `mock_${order.id}`, amount: 10000 }), hasCode("INVALID_PAYMENT_KEY"));
  const mock = createPaymentService(database, { mode: "mock" });
  await assert.rejects(mock.confirm("owner", { orderId: order.id, paymentKey: `mock_${order.id}`, amount: 10000 }), hasCode("PAYMENT_MODE_CHANGED"));
  assert.equal(calls, 0);
});

test("동시 승인은 DB 잠금으로 하나만 전송하며 완료 뒤 같은 요청은 기존 결과를 받는다", async () => {
  const { database } = paymentDatabase();
  let release!: () => void;
  let entered!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { entered = resolve; });
  let calls = 0;
  const gateway: PaymentGateway = {
    confirm: async (input) => { calls++; entered(); await pending; return done(input.orderId); },
    find: async () => assert.fail("new order must confirm first"),
  };
  const service = createPaymentService(database, tossConfig, gateway);
  const order = await service.createOrder("owner", "curation-demo");
  const input = { orderId: order.id, paymentKey: "valid_payment_key", amount: 10000 };
  const first = service.confirm("owner", input);
  await started;
  await assert.rejects(service.confirm("owner", input), hasCode("PAYMENT_PROCESSING"));
  release();
  assert.equal((await first).status, "PAID");
  assert.equal((await service.confirm("owner", input)).status, "PAID");
  assert.equal(calls, 1);
});

test("PG 타임아웃 뒤 조회에서 DONE이 확인되면 재승인 없이 완료한다", async () => {
  const { database } = paymentDatabase();
  let orderId = "";
  let calls = 0;
  const service = createPaymentService(database, tossConfig, {
    confirm: async () => { calls++; throw new GatewayError("uncertain"); },
    find: async () => done(orderId),
  });
  orderId = (await service.createOrder("owner", "curation-demo")).id;
  assert.equal((await service.confirm("owner", { orderId, paymentKey: "valid_payment_key", amount: 10000 })).status, "PAID");
  assert.equal(calls, 1);
});

test("다른 주문에 같은 PG 결제키를 재사용하면 승인 요청 전에 거절한다", async () => {
  const { database } = paymentDatabase();
  let calls = 0;
  const service = createPaymentService(database, tossConfig, {
    confirm: async (input) => { calls++; return done(input.orderId); },
    find: async () => assert.fail("unexpected provider lookup"),
  });
  const first = await service.createOrder("owner", "curation-demo");
  await service.confirm("owner", { orderId: first.id, paymentKey: "valid_payment_key", amount: 10000 });
  const second = await service.createOrder("owner", "curation-demo");
  await assert.rejects(service.confirm("owner", { orderId: second.id, paymentKey: "valid_payment_key", amount: 10000 }), hasCode("PAYMENT_KEY_REUSED"));
  assert.equal(calls, 1);
  assert.equal((await service.getOrder("owner", second.id)).status, "PENDING");
});

test("승인·조회 모두 실패하면 CONFIRMING을 보존하고 같은 주문·멱등키로 복구한다", async () => {
  const { database, rows } = paymentDatabase();
  const attempts: string[] = [];
  let recover = false;
  const service = createPaymentService(database, tossConfig, {
    confirm: async (input) => {
      attempts.push(input.idempotencyKey);
      if (!recover) throw new GatewayError("uncertain");
      return done(input.orderId);
    },
    find: async () => { throw recover ? new GatewayError("not-found", "NOT_FOUND_PAYMENT", 404) : new GatewayError("uncertain"); },
  });
  const order = await service.createOrder("owner", "curation-demo");
  await assert.rejects(service.confirm("owner", { orderId: order.id, paymentKey: "valid_payment_key", amount: 10000 }), hasCode("PAYMENT_UNCERTAIN"));
  assert.equal(rows.get(order.id)?.status, "CONFIRMING");
  assert.equal(rows.get(order.id)?.leaseToken, null);
  await assert.rejects(service.createOrder("owner", "curation-demo"), hasCode("PAYMENT_PROCESSING"));
  await assert.rejects(service.confirm("owner", { orderId: order.id, paymentKey: "different_payment_key", amount: 10000 }), hasCode("PAYMENT_KEY_MISMATCH"));
  recover = true;
  assert.equal((await service.reconcile("owner", order.id)).status, "PAID");
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0], attempts[1]);
});

test("PG에서 실패 상태를 확인해야만 FAILED를 기록한다", async () => {
  const { database, rows } = paymentDatabase();
  let orderId = "";
  const service = createPaymentService(database, tossConfig, {
    confirm: async () => { throw new GatewayError("rejected"); },
    find: async () => ({ ...done(orderId), status: "ABORTED", approvedAt: null }),
  });
  orderId = (await service.createOrder("owner", "curation-demo")).id;
  await assert.rejects(service.confirm("owner", { orderId, paymentKey: "valid_payment_key", amount: 10000 }), hasCode("PAYMENT_DECLINED"));
  assert.equal(rows.get(orderId)?.status, "FAILED");
  assert.equal(rows.get(orderId)?.paidAt, null);
});

test("첫 승인에서 확정 키 오류와 정확한 결제 없음이 함께 확인되면 실패로 닫아 새 주문을 허용한다", async () => {
  for (const [status, code] of [[400, "INVALID_PAYMENT_KEY"], [404, "NOT_FOUND_PAYMENT"], [404, "NOT_FOUND_PAYMENT_SESSION"]] as const) {
    const { database, rows } = paymentDatabase();
    const service = createPaymentService(database, tossConfig, {
      confirm: async () => { throw new GatewayError(status === 404 && code === "NOT_FOUND_PAYMENT" ? "not-found" : "rejected", code, status); },
      find: async () => { throw new GatewayError("not-found", "NOT_FOUND_PAYMENT", 404); },
    });
    const order = await service.createOrder("owner", "curation-demo");
    await assert.rejects(service.confirm("owner", { orderId: order.id, paymentKey: "invalid_key", amount: 10000 }), hasCode("PAYMENT_DECLINED"));
    assert.equal(rows.get(order.id)?.status, "FAILED");
    assert.equal(rows.get(order.id)?.leaseToken, null);
    const publicResult = await service.getOrder("owner", order.id);
    assert.equal(publicResult.failureCode, "PAYMENT_DECLINED");
    assert.equal(JSON.stringify(publicResult).includes(code), false);
    assert.notEqual((await service.createOrder("owner", "curation-demo")).id, order.id);
  }
});

test("타임아웃·이미 처리됨·일반 4xx·모호한 조회 오류는 실패로 단정하지 않는다", async () => {
  for (const [confirmationError, lookupError] of [
    [new GatewayError("uncertain"), new GatewayError("not-found", "NOT_FOUND_PAYMENT", 404)],
    [new GatewayError("rejected", "ALREADY_PROCESSED_PAYMENT", 400), new GatewayError("not-found", "NOT_FOUND_PAYMENT", 404)],
    [new GatewayError("rejected", "INVALID_REQUEST", 400), new GatewayError("not-found", "NOT_FOUND_PAYMENT", 404)],
    [new GatewayError("rejected", "INVALID_PAYMENT_KEY", 400), new GatewayError("not-found")],
    [new GatewayError("rejected", "INVALID_PAYMENT_KEY", 400), new GatewayError("uncertain")],
  ]) {
    const { database, rows } = paymentDatabase();
    const service = createPaymentService(database, tossConfig, {
      confirm: async () => { throw confirmationError; },
      find: async () => { throw lookupError; },
    });
    const order = await service.createOrder("owner", "curation-demo");
    await assert.rejects(service.confirm("owner", { orderId: order.id, paymentKey: "valid_payment_key", amount: 10000 }), hasCode("PAYMENT_UNCERTAIN"));
    assert.equal(rows.get(order.id)?.status, "CONFIRMING");
  }
});

test("이전 승인 결과가 불확실했던 주문은 나중에 키가 없다는 응답을 받아도 FAILED로 변경하지 않는다", async () => {
  const { database, rows } = paymentDatabase();
  let firstAttempt = true;
  const service = createPaymentService(database, tossConfig, {
    confirm: async () => { throw firstAttempt ? new GatewayError("uncertain") : new GatewayError("rejected", "INVALID_PAYMENT_KEY", 400); },
    find: async () => { throw new GatewayError("not-found", "NOT_FOUND_PAYMENT", 404); },
  });
  const order = await service.createOrder("owner", "curation-demo");
  await assert.rejects(service.confirm("owner", { orderId: order.id, paymentKey: "valid_payment_key", amount: 10000 }), hasCode("PAYMENT_UNCERTAIN"));
  firstAttempt = false;
  await assert.rejects(service.reconcile("owner", order.id), hasCode("PAYMENT_UNCERTAIN"));
  assert.equal(rows.get(order.id)?.status, "CONFIRMING");
});

test("HTTP 어댑터가 오류 코드를 보존해 확정 잘못된 결제키 주문을 안전하게 종료한다", async () => {
  const { database, rows } = paymentDatabase();
  const gateway = createTossGateway("test_sk_example", (async (url) => {
    const confirmation = String(url).endsWith("/confirm");
    return new Response(JSON.stringify({ code: confirmation ? "INVALID_PAYMENT_KEY" : "NOT_FOUND_PAYMENT", message: "SECRET_PROVIDER_MESSAGE" }), { status: confirmation ? 400 : 404 });
  }) as typeof fetch);
  const service = createPaymentService(database, tossConfig, gateway);
  const order = await service.createOrder("owner", "curation-demo");
  await assert.rejects(service.confirm("owner", { orderId: order.id, paymentKey: "invalid_key", amount: 10000 }), (error: unknown) => {
    assert.ok(error instanceof PaymentError);
    assert.equal(error.code, "PAYMENT_DECLINED");
    assert.equal(error.message.includes("SECRET_PROVIDER_MESSAGE"), false);
    return true;
  });
  assert.equal(rows.get(order.id)?.status, "FAILED");
});

test("PG 응답의 주문·금액·통화·키·상태·수단이 다르면 완료하지 않는다", async () => {
  for (const override of [{ orderId: "other-order" }, { totalAmount: 1 }, { currency: "USD" }, { paymentKey: "other-key" }, { status: "WAITING_FOR_DEPOSIT" }, { method: "가상계좌" }, { type: "BILLING" }]) {
    const { database, rows } = paymentDatabase();
    const service = createPaymentService(database, tossConfig, {
      confirm: async (input) => ({ ...done(input.orderId), ...override }),
      find: async () => assert.fail("initial mismatched result stays uncertain"),
    });
    const order = await service.createOrder("owner", "curation-demo");
    await assert.rejects(service.confirm("owner", { orderId: order.id, paymentKey: "valid_payment_key", amount: 10000 }), (error: unknown) => error instanceof PaymentError && error.status === 502);
    assert.equal(rows.get(order.id)?.status, "CONFIRMING");
    assert.equal(rows.get(order.id)?.paidAt, null);
  }
});

test("함수 중단으로 잠금이 남아도 만료 후 조회로 복구하며 오래된 불명확 주문은 재승인하지 않는다", async () => {
  const { database, rows } = paymentDatabase();
  let finished = true;
  let orderId = "";
  const service = createPaymentService(database, tossConfig, {
    confirm: async () => assert.fail("must not confirm an old ambiguous order"),
    find: async () => finished ? done(orderId) : ({ ...done(orderId), status: "IN_PROGRESS", approvedAt: null }),
  });
  orderId = (await service.createOrder("owner", "curation-demo")).id;
  const row = rows.get(orderId)!;
  Object.assign(row, { status: "CONFIRMING", paymentKey: "valid_payment_key", leaseToken: "previous-process", leaseUntil: new Date(0) });
  assert.equal((await service.reconcile("owner", orderId)).status, "PAID");
  finished = false;
  Object.assign(row, { status: "CONFIRMING", paidAt: null, createdAt: new Date(Date.now() - 15 * 86400_000) });
  await assert.rejects(service.reconcile("owner", orderId), hasCode("PAYMENT_REVIEW_REQUIRED"));
});

test("Toss HTTP adapter는 고정 멱등키·타임아웃을 전달하고 원문 오류를 숨긴다", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const gateway = createTossGateway("test_sk_example", (async (url, init) => {
    calls.push({ url: String(url), init: init! });
    return new Response(JSON.stringify({ message: "SECRET_PROVIDER_TEXT" }), { status: 503 });
  }) as typeof fetch);
  await assert.rejects(gateway.confirm({ orderId: "order", paymentKey: "key", amount: 10000, idempotencyKey: "stable-id" }), (error: unknown) => error instanceof GatewayError && error.kind === "uncertain" && !error.message.includes("SECRET_PROVIDER_TEXT"));
  assert.equal(calls[0]?.url, "https://api.tosspayments.com/v1/payments/confirm");
  assert.equal((calls[0]?.init.headers as Record<string, string>)["Idempotency-Key"], "stable-id");
  assert.ok(calls[0]?.init.signal instanceof AbortSignal);
  assert.equal(calls[0]?.init.redirect, "error");
});
