import { createHmac, timingSafeEqual } from "node:crypto";
import type { RequestHandler } from "express";

import type { Database } from "../db.js";
import type { PaymentConfig } from "./payment-config.js";

type TallySubmission = {
  eventId: string;
  submissionId: string;
  formId: string;
  submittedAt: Date;
};

function isValidSignature(payload: Buffer, received: string | undefined, secret: string): boolean {
  if (!received) return false;
  const expected = createHmac("sha256", secret).update(payload).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(received, "base64");
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function readSubmission(payload: Buffer, expectedFormId: string): TallySubmission | null {
  try {
    const value = JSON.parse(payload.toString("utf8")) as Record<string, unknown>;
    const data = value.data as Record<string, unknown> | undefined;
    const submittedAt = typeof data?.createdAt === "string" ? new Date(data.createdAt) : null;
    if (value.eventType !== "FORM_RESPONSE"
      || typeof value.eventId !== "string"
      || !/^[A-Za-z0-9_-]{6,128}$/.test(value.eventId)
      || typeof data?.submissionId !== "string"
      || !/^[A-Za-z0-9_-]{6,128}$/.test(data.submissionId)
      || data.formId !== expectedFormId
      || !submittedAt
      || !Number.isFinite(submittedAt.getTime())) return null;
    return { eventId: value.eventId, submissionId: data.submissionId, formId: expectedFormId, submittedAt };
  } catch {
    return null;
  }
}

export function createTallyWebhookHandler(database: Database, config: PaymentConfig): RequestHandler {
  return async (request, response) => {
    if (!config.tallyFormId || !config.tallySigningSecret) {
      response.status(503).json({ code: "APPLICATION_VERIFICATION_UNAVAILABLE", message: "신청 확인 기능이 아직 준비되지 않았습니다." });
      return;
    }
    if (!Buffer.isBuffer(request.body)
      || !isValidSignature(request.body, request.header("tally-signature"), config.tallySigningSecret)) {
      response.status(401).json({ code: "INVALID_TALLY_SIGNATURE", message: "신청 확인 요청을 인증할 수 없습니다." });
      return;
    }
    const submission = readSubmission(request.body, config.tallyFormId);
    if (!submission) {
      response.status(400).json({ code: "INVALID_TALLY_EVENT", message: "신청 확인 요청 형식이 올바르지 않습니다." });
      return;
    }
    await database.curationSubmission.upsert({
      where: { id: submission.submissionId },
      update: {},
      create: {
        id: submission.submissionId,
        formId: submission.formId,
        eventId: submission.eventId,
        submittedAt: submission.submittedAt,
      },
    });
    response.status(204).end();
  };
}
