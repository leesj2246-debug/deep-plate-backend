-- Preserve existing member orders while allowing one guest order per Tally submission.
ALTER TABLE "payment_orders" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "payment_orders" ADD COLUMN "application_submission_id" VARCHAR(128);

CREATE UNIQUE INDEX "payment_orders_application_submission_id_key"
  ON "payment_orders"("application_submission_id");
CREATE INDEX "payment_orders_application_submission_id_created_at_idx"
  ON "payment_orders"("application_submission_id", "created_at");

ALTER TABLE "payment_orders" ADD CONSTRAINT "payment_orders_owner_check"
  CHECK (("user_id" IS NOT NULL) <> ("application_submission_id" IS NOT NULL));
