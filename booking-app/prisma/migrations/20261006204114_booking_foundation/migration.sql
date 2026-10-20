-- CreateTable
CREATE TABLE "BookingSettings" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "dailyCapacity" INTEGER NOT NULL DEFAULT 1,
    "prepaymentPercent" INTEGER NOT NULL DEFAULT 30,
    "balanceDaysBefore" INTEGER NOT NULL DEFAULT 30,
    "agreementText" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "WeddingBooking" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "WeddingBooking_shop_weddingDate_status_idx" ON "WeddingBooking"("shop", "weddingDate", "status");
