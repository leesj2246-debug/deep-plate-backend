-- Additive only: no existing row/table is changed or removed.
CREATE TABLE "payment_orders" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "product_id" VARCHAR(80) NOT NULL,
  "name" VARCHAR(100) NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" VARCHAR(3) NOT NULL,
  "mode" VARCHAR(20) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "payment_key" VARCHAR(200),
  "idempotency_key" UUID NOT NULL,
  "lease_token" UUID,
  "lease_until" TIMESTAMPTZ(3),
  "failure_code" VARCHAR(80),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,
  "paid_at" TIMESTAMPTZ(3),
  CONSTRAINT "payment_orders_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_orders_amount_check" CHECK ("amount" > 0),
  CONSTRAINT "payment_orders_currency_check" CHECK ("currency" = 'KRW'),
  CONSTRAINT "payment_orders_mode_check" CHECK ("mode" IN ('mock', 'toss-test')),
  CONSTRAINT "payment_orders_status_check" CHECK ("status" IN ('PENDING', 'CONFIRMING', 'PAID', 'FAILED')),
  CONSTRAINT "payment_orders_paid_check" CHECK ("status" <> 'PAID' OR ("payment_key" IS NOT NULL AND "paid_at" IS NOT NULL))
);
CREATE UNIQUE INDEX "payment_orders_payment_key_key" ON "payment_orders"("payment_key");
CREATE UNIQUE INDEX "payment_orders_idempotency_key_key" ON "payment_orders"("idempotency_key");
CREATE INDEX "payment_orders_user_id_created_at_idx" ON "payment_orders"("user_id", "created_at");
ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
