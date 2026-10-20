-- CreateTable
CREATE TABLE "BookingPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'creating',
    "currency" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "expectedGrandTotalCents" INTEGER NOT NULL,
    "draftOrderId" TEXT,
    "orderId" TEXT,
    "invoiceUrl" TEXT,
    "receivedCents" INTEGER NOT NULL DEFAULT 0,
    "refundedCents" INTEGER NOT NULL DEFAULT 0,
    "orderUpdatedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BookingEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BookingWebhook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "processedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "BookingMail" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dueDate" TEXT,
    "sendAt" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "operationId" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BookingSettings" (
    "shop" TEXT NOT NULL PRIMARY KEY,
    "dailyCapacity" INTEGER NOT NULL DEFAULT 1,
    "prepaymentPercent" INTEGER NOT NULL DEFAULT 30,
    "balanceDaysBefore" INTEGER NOT NULL DEFAULT 30,
    "agreementText" TEXT NOT NULL DEFAULT '',
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_BookingSettings" ("agreementText", "balanceDaysBefore", "dailyCapacity", "prepaymentPercent", "shop", "updatedAt") SELECT "agreementText", "balanceDaysBefore", "dailyCapacity", "prepaymentPercent", "shop", "updatedAt" FROM "BookingSettings";
DROP TABLE "BookingSettings";
ALTER TABLE "new_BookingSettings" RENAME TO "BookingSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "BookingPayment_draftOrderId_key" ON "BookingPayment"("draftOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingPayment_orderId_key" ON "BookingPayment"("orderId");

-- CreateIndex
CREATE INDEX "BookingPayment_shop_bookingId_idx" ON "BookingPayment"("shop", "bookingId");

-- CreateIndex
CREATE INDEX "BookingEvent_shop_bookingId_createdAt_idx" ON "BookingEvent"("shop", "bookingId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingMail_operationId_key" ON "BookingMail"("operationId");

-- CreateIndex
CREATE INDEX "BookingMail_status_sendAt_idx" ON "BookingMail"("status", "sendAt");

