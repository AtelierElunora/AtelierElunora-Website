-- AlterTable
ALTER TABLE "elunora_booking"."BookingSettings" ADD COLUMN     "configJson" TEXT NOT NULL DEFAULT '{}';

-- CreateTable
CREATE TABLE "elunora_booking"."BookingPayment" (
    "id" TEXT NOT NULL,
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
    "orderUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elunora_booking"."BookingEvent" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elunora_booking"."BookingWebhook" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elunora_booking"."BookingMail" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dueDate" TEXT,
    "sendAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "operationId" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookingMail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingPayment_draftOrderId_key" ON "elunora_booking"."BookingPayment"("draftOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "BookingPayment_orderId_key" ON "elunora_booking"."BookingPayment"("orderId");

-- CreateIndex
CREATE INDEX "BookingPayment_shop_bookingId_idx" ON "elunora_booking"."BookingPayment"("shop", "bookingId");

-- CreateIndex
CREATE INDEX "BookingEvent_shop_bookingId_createdAt_idx" ON "elunora_booking"."BookingEvent"("shop", "bookingId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BookingMail_operationId_key" ON "elunora_booking"."BookingMail"("operationId");

-- CreateIndex
CREATE INDEX "BookingMail_status_sendAt_idx" ON "elunora_booking"."BookingMail"("status", "sendAt");

