export type PaymentConfig = {
  mode: "disabled" | "mock" | "toss-test";
  clientKey?: string;
  secretKey?: string;
  tallyFormId?: string;
  tallySigningSecret?: string;
};

export function loadPaymentConfig(env: Record<string, string | undefined> = process.env): PaymentConfig {
  const mode = env.PAYMENT_MODE?.trim() || "disabled";
  if (mode !== "disabled" && mode !== "mock" && mode !== "toss-test") {
    throw new Error("PAYMENT_MODE는 disabled, mock, toss-test만 허용합니다.");
  }
  const clientKey = env.TOSS_CLIENT_KEY?.trim() || undefined;
  const secretKey = env.TOSS_SECRET_KEY?.trim() || undefined;
  const tallyFormId = env.TALLY_FORM_ID?.trim() || undefined;
  const tallySigningSecret = env.TALLY_SIGNING_SECRET?.trim() || undefined;
  // Fail closed even when disabled/mock: this service never accepts live credentials.
  if (clientKey && !/^test_(?:g)?ck_[A-Za-z0-9_-]+$/.test(clientKey)) {
    throw new Error("TOSS_CLIENT_KEY는 테스트 클라이언트 키만 허용합니다.");
  }
  if (secretKey && !/^test_(?:g)?sk_[A-Za-z0-9_-]+$/.test(secretKey)) {
    throw new Error("TOSS_SECRET_KEY는 테스트 시크릿 키만 허용합니다.");
  }
  if (mode === "toss-test" && (!clientKey || !secretKey)) {
    throw new Error("toss-test 모드에는 한 세트의 테스트 클라이언트/시크릿 키가 필요합니다.");
  }
  if (clientKey && secretKey && clientKey.startsWith("test_gck_") !== secretKey.startsWith("test_gsk_")) {
    throw new Error("클라이언트와 시크릿 키의 연동 종류가 일치해야 합니다.");
  }
  if ((tallyFormId && !tallySigningSecret) || (!tallyFormId && tallySigningSecret)) {
    throw new Error("TALLY_FORM_ID와 TALLY_SIGNING_SECRET은 함께 설정해야 합니다.");
  }
  if (tallyFormId && !/^[A-Za-z0-9_-]{4,80}$/.test(tallyFormId)) {
    throw new Error("TALLY_FORM_ID 형식이 올바르지 않습니다.");
  }
  return { mode, clientKey, secretKey, tallyFormId, tallySigningSecret };
}
