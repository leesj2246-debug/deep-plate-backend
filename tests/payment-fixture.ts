import { randomUUID } from "node:crypto";

import type { Database } from "../src/db.js";
import type { CurationSubmission, PaymentOrder } from "../src/generated/prisma/client.js";

// Test double only. The application always persists orders through Prisma/PostgreSQL.
export function paymentDatabase() {
  const rows = new Map<string, PaymentOrder>();
  const submissions = new Map<string, CurationSubmission>();
  type Filter = Record<string, unknown>;
  function matches(row: PaymentOrder, where: Filter): boolean {
    return Object.entries(where).every(([key, expected]) => {
      if (key === "OR") return (expected as Filter[]).some((item) => matches(row, item));
      if (key === "AND") return (expected as Filter[]).every((item) => matches(row, item));
      const actual = row[key as keyof PaymentOrder];
      if (expected && typeof expected === "object") {
        if ("in" in expected) return (expected.in as unknown[]).includes(actual);
        if ("lte" in expected) return actual instanceof Date && actual <= (expected.lte as Date);
      }
      return actual === expected;
    });
  }
  const database = {
    user: { findFirst: async ({ where }: { where: { id: string } }) => ({ id: where.id }) },
    paymentOrder: {
      create: async ({ data }: { data: Partial<PaymentOrder> }) => {
        const row = {
          id: randomUUID(), idempotencyKey: randomUUID(), createdAt: new Date(), updatedAt: new Date(),
          status: "PENDING", paymentKey: null, leaseToken: null, leaseUntil: null, paidAt: null, failureCode: null,
          ...data,
        } as PaymentOrder;
        rows.set(row.id, row);
        return { ...row };
      },
      findFirst: async ({ where }: { where: Filter }) => {
        const row = [...rows.values()].find((item) => matches(item, where));
        return row ? { ...row } : null;
      },
      findMany: async ({ where }: { where: Filter }) => [...rows.values()].filter((row) => matches(row, where)).map((row) => ({ ...row })),
      updateMany: async ({ where, data }: { where: Filter; data: Partial<PaymentOrder> }) => {
        let count = 0;
        for (const row of rows.values()) {
          if (matches(row, where)) {
            if (data.paymentKey && [...rows.values()].some((other) => other.id !== row.id && other.paymentKey === data.paymentKey)) {
              throw Object.assign(new Error("duplicate payment key"), { code: "P2002" });
            }
            Object.assign(row, data);
            count += 1;
          }
        }
        return { count };
      },
    },
    curationSubmission: {
      findFirst: async ({ where }: { where: { id: string; formId: string } }) => {
        const submission = submissions.get(where.id);
        return submission?.formId === where.formId ? { ...submission } : null;
      },
      upsert: async ({ where, create }: { where: { id: string }; create: Omit<CurationSubmission, "createdAt"> }) => {
        const existing = submissions.get(where.id);
        if (existing) return { ...existing };
        const submission = { ...create, createdAt: new Date() } as CurationSubmission;
        submissions.set(submission.id, submission);
        return { ...submission };
      },
    },
  } as unknown as Database;
  function verifySubmission(id: string, formId = "ZjAlQe") {
    submissions.set(id, {
      id,
      formId,
      eventId: randomUUID(),
      submittedAt: new Date(),
      createdAt: new Date(),
    });
  }
  return { database, rows, submissions, verifySubmission };
}
