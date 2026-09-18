export class PaymentError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

function invalid(message: string): never {
  throw new PaymentError(400, "INVALID_PAYMENT_INPUT", message);
}

function object(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid("요청 형식이 올바르지 않습니다.");
  return input as Record<string, unknown>;
}

export function parseOrderId(input: unknown): string {
  if (typeof input !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input)) {
    invalid("주문번호 형식이 올바르지 않습니다.");
  }
  return input;
}

export function parseCreateOrder(input: unknown): string {
  const body = object(input);
  if (Object.keys(body).some((key) => key !== "productId") || typeof body.productId !== "string" || body.productId.length > 80) {
    invalid("상품번호만 전달해 주세요. 가격은 서버에서 결정합니다.");
  }
  return body.productId;
}

export function parseGuestCreateOrder(input: unknown) {
  const body = object(input);
  if (Object.keys(body).some((key) => !["productId", "applicationSubmissionId"].includes(key))
    || typeof body.productId !== "string" || body.productId.length > 80
    || typeof body.applicationSubmissionId !== "string"
    || !/^[A-Za-z0-9_-]{6,128}$/.test(body.applicationSubmissionId)) {
    invalid("상품번호와 유효한 신청 제출번호만 전달해 주세요.");
  }
  return { productId: body.productId, applicationSubmissionId: body.applicationSubmissionId };
}

export function parseConfirmation(input: unknown) {
  const body = object(input);
  const orderId = parseOrderId(body.orderId);
  if (Object.keys(body).some((key) => !["orderId", "paymentKey", "amount"].includes(key))) invalid("허용되지 않은 결제 입력입니다.");
  if (typeof body.paymentKey !== "string" || body.paymentKey.length < 1 || body.paymentKey.length > 200 || !/^[A-Za-z0-9_-]+$/.test(body.paymentKey)) {
    invalid("결제 식별값 형식이 올바르지 않습니다.");
  }
  if (typeof body.amount !== "number" || !Number.isSafeInteger(body.amount) || body.amount <= 0) {
    invalid("결제 금액은 양의 정수여야 합니다.");
  }
  return { orderId, paymentKey: body.paymentKey, amount: body.amount };
}
