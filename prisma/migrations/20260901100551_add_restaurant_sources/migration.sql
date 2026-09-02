-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "last_verified_at" TIMESTAMPTZ(3),
ADD COLUMN     "source_url" VARCHAR(2048);
