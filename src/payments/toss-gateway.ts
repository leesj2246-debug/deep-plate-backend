export class GatewayError extends Error {
  constructor(
    public readonly kind: "not-found" | "rejected" | "uncertain",
    public readonly providerCode?: string,
    public readonly httpStatus?: number,
  ) {
    super("결제사 응답을 확인하지 못했습니다.");
  }
}

export function isDefinitiveKeyError(error: unknown): boolean {
  if (!(error instanceof GatewayError) || error.kind === "uncertain") return false;
  return (error.httpStatus === 400 && error.providerCode === "INVALID_PAYMENT_KEY")
    || (error.httpStatus === 404 && ["NOT_FOUND_PAYMENT", "NOT_FOUND_PAYMENT_SESSION"].includes(error.providerCode ?? ""));
}

export type PaymentGateway = {
  confirm(input: { orderId: string; paymentKey: string; amount: number; idempotencyKey: string }): Promise<unknown>;
  find(paymentKey: string): Promise<unknown>;
};

export function createTossGateway(secretKey: string, fetcher: typeof fetch = fetch): PaymentGateway {
  if (!/^test_(?:g)?sk_[A-Za-z0-9_-]+$/.test(secretKey)) {
    throw new Error("결제사 호출에는 테스트 시크릿 키만 사용할 수 있습니다.");
  }
  const authorization = `Basic ${Buffer.from(`${secretKey}:`).toString("base64")}`;
  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    try {
      const response = await fetcher(`https://api.tosspayments.com/v1${path}`, {
        ...init,
        headers: { ...init.headers, Authorization: authorization },
        signal: AbortSignal.timeout(8_000),
        redirect: "error",
        cache: "no-store",
      });
      if (!response.ok) {
        // Retain only a bounded code for internal classification. Never keep/forward provider text.
        const body: unknown = await response.json().catch(() => null);
        const rawCode = body && typeof body === "object" && "code" in body ? body.code : undefined;
        const code = typeof rawCode === "string" && /^[A-Z_]{1,80}$/.test(rawCode) ? rawCode : undefined;
        if (response.status === 404 && code === "NOT_FOUND_PAYMENT") throw new GatewayError("not-found", code, response.status);
        if (response.status >= 400 && response.status < 500 && ![408, 409, 429].includes(response.status)) {
          throw new GatewayError("rejected", code, response.status);
        }
        throw new GatewayError("uncertain", code, response.status);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof GatewayError) throw error;
      throw new GatewayError("uncertain");
    }
  }
  return {
    confirm: ({ idempotencyKey, ...body }) => request("/payments/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
      body: JSON.stringify(body),
    }),
    find: (paymentKey) => request(`/payments/${encodeURIComponent(paymentKey)}`),
  };
}
