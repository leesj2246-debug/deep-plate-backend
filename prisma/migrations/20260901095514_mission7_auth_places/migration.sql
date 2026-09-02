-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "contact_type" VARCHAR(30),
    "contact_value" VARCHAR(255),
    "preferred_language" VARCHAR(10),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),
    "deleted_by" VARCHAR(100),
    "delete_reason" VARCHAR(500),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "restaurants" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name_ko" VARCHAR(150) NOT NULL,
    "name_ja" VARCHAR(150),
    "name_en" VARCHAR(150),
    "area" VARCHAR(80) NOT NULL,
    "category" VARCHAR(80) NOT NULL,
    "min_budget" INTEGER,
    "max_budget" INTEGER,
    "description" VARCHAR(1000),
    "image_url" VARCHAR(2048),
    "map_url" VARCHAR(2048),
    "verification_status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_places" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "restaurant_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted_at" TIMESTAMPTZ(3),

    CONSTRAINT "saved_places_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_deleted_at_idx" ON "customers"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "restaurants_slug_key" ON "restaurants"("slug");

-- CreateIndex
CREATE INDEX "restaurants_area_category_idx" ON "restaurants"("area", "category");

-- CreateIndex
CREATE INDEX "restaurants_deleted_at_idx" ON "restaurants"("deleted_at");

-- CreateIndex
CREATE INDEX "saved_places_user_id_deleted_at_idx" ON "saved_places"("user_id", "deleted_at");

-- CreateIndex
CREATE INDEX "saved_places_restaurant_id_idx" ON "saved_places"("restaurant_id");

-- CreateIndex
CREATE UNIQUE INDEX "saved_places_user_id_restaurant_id_key" ON "saved_places"("user_id", "restaurant_id");

-- AddForeignKey
ALTER TABLE "saved_places" ADD CONSTRAINT "saved_places_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_places" ADD CONSTRAINT "saved_places_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
