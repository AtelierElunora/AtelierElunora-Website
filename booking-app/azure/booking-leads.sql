-- CreateTable
CREATE TABLE "elunora_booking"."BookingLead" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "weddingDate" TEXT NOT NULL DEFAULT '',
    "venue" TEXT NOT NULL DEFAULT '',
    "guests" INTEGER,
    "packageId" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'new',
    "bookingId" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "consentAt" TIMESTAMP(3) NOT NULL,
    "contactedAt" TIMESTAMP(3),
    "followUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingLead_tokenHash_key" ON "elunora_booking"."BookingLead"("tokenHash");

-- CreateIndex
CREATE INDEX "BookingLead_shop_status_followUpAt_idx" ON "elunora_booking"."BookingLead"("shop", "status", "followUpAt");
