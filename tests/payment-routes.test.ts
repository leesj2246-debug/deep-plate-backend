import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createApp } from "../src/app.js";
import { createAccessToken } from "../src/auth/auth-security.js";
import { paymentDatabase } from "./payment-fixture.js";

const options = { frontendOrigin: "http://localhost:5173", jwtSecret: "payment-test-secret-longer-than-32-characters" };
const paymentOptions = { mode: "mock" as const, tallyFormId: "ZjAlQe", tallySigningSecret: "tally-test-signing-secret" };

test("HTTP 전체 흐름: 검증된 신청 → 비회원 주문 → 승인, 소유권·금액 변조는 거절", async () => {
  const { database, verifySubmission } = paymentDatabase();
  verifySubmission("tally_submission_http");
  const server = createApp(database, { ...options, payments: paymentOptions }).listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const other = createAccessToken("other", options.jwtSecret);
  try {
    const product = await fetch(`${base}/payments/product`);
    assert.equal(product.status, 200);
    assert.equal(product.headers.get("cache-control"), "no-store");
    assert.equal((await product.json() as { mode: string }).mode, "mock");
    assert.equal((await fetch(`${base}/payments/orders/me`)).status, 401);
    const create = await fetch(`${base}/payments/guest/orders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: "curation-demo", applicationSubmissionId: "tally_submission_http" }) });
    assert.equal(create.status, 201);
    const { order, checkoutToken } = await create.json() as { order: { id: string; amount: number }; checkoutToken: string };
    assert.equal(order.amount, 10000);
    assert.equal((await fetch(`${base}/payments/orders/${order.id}`, { headers: { Authorization: `Bearer ${other}` } })).status, 404);
    const input = { orderId: order.id, paymentKey: `mock_${order.id}`, amount: order.amount };
    const guestHeaders = { "Content-Type": "application/json", "X-Checkout-Token": checkoutToken };
    const tampered = await fetch(`${base}/payments/guest/confirm`, { method: "POST", headers: guestHeaders, body: JSON.stringify({ ...input, amount: 1 }) });
    assert.equal(tampered.status, 400);
    assert.equal((await tampered.json() as { code: string }).code, "AMOUNT_MISMATCH");
    const confirm = await fetch(`${base}/payments/guest/confirm`, { method: "POST", headers: guestHeaders, body: JSON.stringify(input) });
    assert.equal(confirm.status, 200);
    const result = await confirm.json() as { order: { status: string; mode: string } };
    assert.equal(result.order.status, "PAID");
    assert.equal(result.order.mode, "mock");
    const reconcile = await fetch(`${base}/payments/guest/orders/${order.id}/reconcile`, { method: "POST", headers: guestHeaders });
    assert.equal(reconcile.status, 200);
    const serialized = JSON.stringify(await reconcile.json());
    assert.ok(!serialized.includes(input.paymentKey));
    assert.equal((await fetch(`${base}/payments/orders/not-a-uuid`, { headers: { Authorization: `Bearer ${other}` } })).status, 400);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("결제 설정이 없으면 상품은 비활성으로 표시하고 주문 생성을 막는다", async () => {
  const { database } = paymentDatabase();
  const server = createApp(database, options).listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const product = await fetch(`${base}/payments/product`);
    assert.equal((await product.json() as { available: boolean }).available, false);
    const create = await fetch(`${base}/payments/guest/orders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: "curation-demo", applicationSubmissionId: "tally_submission_disabled" }) });
    assert.equal(create.status, 503);
    assert.equal((await create.json() as { code: string }).code, "PAYMENTS_DISABLED");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("Tally 서명 설정이 없으면 mock 결제도 신청 주문을 만들지 않는다", async () => {
  const { database } = paymentDatabase();
  const server = createApp(database, { ...options, payments: { mode: "mock" } }).listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const product = await fetch(`${base}/payments/product`);
    const productBody = await product.json() as { available: boolean; mode: string };
    assert.equal(productBody.available, false);
    assert.equal(productBody.mode, "disabled");
    const create = await fetch(`${base}/payments/guest/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "curation-demo", applicationSubmissionId: "tally_unverified_config" }),
    });
    assert.equal(create.status, 503);
    assert.equal((await create.json() as { code: string }).code, "APPLICATION_VERIFICATION_UNAVAILABLE");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("비회원은 신청 제출번호로 만든 주문 한 건만 서명 토큰으로 결제한다", async () => {
  const { database, verifySubmission } = paymentDatabase();
  verifySubmission("tally_submission_123");
  verifySubmission("tally_submission_456");
  const server = createApp(database, { ...options, payments: paymentOptions }).listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const createGuest = async (applicationSubmissionId: string) => {
    const response = await fetch(`${base}/payments/guest/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "curation-demo", applicationSubmissionId }),
    });
    assert.equal(response.status, 201);
    return response.json() as Promise<{ order: { id: string; amount: number }; checkoutToken: string }>;
  };
  try {
    const first = await createGuest("tally_submission_123");
    const repeated = await createGuest("tally_submission_123");
    assert.equal(repeated.order.id, first.order.id);
    assert.ok(first.checkoutToken.length > 40);
    assert.equal((await fetch(`${base}/payments/orders/me`, { headers: { Authorization: `Bearer ${first.checkoutToken}` } })).status, 401);

    const input = { orderId: first.order.id, paymentKey: `mock_${first.order.id}`, amount: first.order.amount };
    const missingAccess = await fetch(`${base}/payments/guest/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) });
    assert.equal(missingAccess.status, 401);
    assert.equal((await missingAccess.json() as { code: string }).code, "CHECKOUT_ACCESS_REQUIRED");

    const second = await createGuest("tally_submission_456");
    const wrongOrder = await fetch(`${base}/payments/guest/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Checkout-Token": first.checkoutToken },
      body: JSON.stringify({ orderId: second.order.id, paymentKey: `mock_${second.order.id}`, amount: second.order.amount }),
    });
    assert.equal(wrongOrder.status, 404);

    const confirm = await fetch(`${base}/payments/guest/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Checkout-Token": first.checkoutToken },
      body: JSON.stringify(input),
    });
    assert.equal(confirm.status, 200);
    const result = await confirm.json() as { order: { status: string }; checkoutToken?: string };
    assert.equal(result.order.status, "PAID");
    assert.equal(result.checkoutToken, undefined);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("Tally 서명 웹훅만 신청을 검증하고 답변 내용은 저장하지 않는다", async () => {
  const { database, submissions } = paymentDatabase();
  const server = createApp(database, { ...options, payments: paymentOptions }).listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const payload = JSON.stringify({
    eventId: "event_tally_verified_123",
    eventType: "FORM_RESPONSE",
    createdAt: "2026-09-18T10:00:00.000Z",
    data: {
      submissionId: "tally_verified_submission",
      formId: "ZjAlQe",
      createdAt: "2026-09-18T10:00:00.000Z",
      fields: [{ label: "email", value: "private@example.com" }],
    },
  });
  const signature = createHmac("sha256", paymentOptions.tallySigningSecret).update(payload).digest("base64");
  try {
    const forged = await fetch(`${base}/webhooks/tally`, { method: "POST", headers: { "Content-Type": "application/json", "Tally-Signature": "forged" }, body: payload });
    assert.equal(forged.status, 401);
    assert.equal(submissions.size, 0);

    const accepted = await fetch(`${base}/webhooks/tally`, { method: "POST", headers: { "Content-Type": "application/json", "Tally-Signature": signature }, body: payload });
    assert.equal(accepted.status, 204);
    assert.equal(submissions.size, 1);
    assert.equal(JSON.stringify([...submissions.values()]).includes("private@example.com"), false);

    const create = await fetch(`${base}/payments/guest/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "curation-demo", applicationSubmissionId: "tally_verified_submission" }),
    });
    assert.equal(create.status, 201);

    const unverified = await fetch(`${base}/payments/guest/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "curation-demo", applicationSubmissionId: "tally_unverified_submission" }),
    });
    assert.equal(unverified.status, 409);
    assert.equal((await unverified.json() as { code: string }).code, "APPLICATION_NOT_VERIFIED");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
