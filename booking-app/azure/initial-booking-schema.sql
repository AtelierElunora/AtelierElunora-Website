-- Proposed migration only; review before applying to the existing production database.
BEGIN;
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "elunora_booking";

-- CreateTable
CREATE TABLE "elunora_booking"."Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elunora_booking"."BookingSettings" (
    "shop" TEXT NOT NULL,
    "dailyCapacity" INTEGER NOT NULL DEFAULT 1,
    "prepaymentPercent" INTEGER NOT NULL DEFAULT 30,
    "balanceDaysBefore" INTEGER NOT NULL DEFAULT 30,
    "agreementText" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingSettings_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "elunora_booking"."WeddingBooking" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "weddingDate" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "totalCents" INTEGER NOT NULL,
    "paidCents" INTEGER NOT NULL DEFAULT 0,
    "balanceDueDate" TEXT,
    "detailsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeddingBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WeddingBooking_shop_weddingDate_status_idx" ON "elunora_booking"."WeddingBooking"("shop", "weddingDate", "status");


COMMIT;
