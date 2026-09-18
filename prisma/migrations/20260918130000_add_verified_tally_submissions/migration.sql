CREATE TABLE "curation_submissions" (
    "id" VARCHAR(128) NOT NULL,
    "form_id" VARCHAR(80) NOT NULL,
    "event_id" VARCHAR(128) NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "curation_submissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "curation_submissions_event_id_key" ON "curation_submissions"("event_id");
CREATE INDEX "curation_submissions_form_id_submitted_at_idx" ON "curation_submissions"("form_id", "submitted_at");
