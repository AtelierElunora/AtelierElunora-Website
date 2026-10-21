-- CreateTable
CREATE TABLE "BookingLead" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "consentAt" DATETIME NOT NULL,
    "contactedAt" DATETIME,
    "followUpAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingLead_tokenHash_key" ON "BookingLead"("tokenHash");

-- CreateIndex
CREATE INDEX "BookingLead_shop_status_followUpAt_idx" ON "BookingLead"("shop", "status", "followUpAt");
