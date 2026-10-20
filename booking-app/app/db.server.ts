import { PrismaClient } from "@prisma/client";
import { PrismaClient as AzurePrismaClient } from './generated/azure-booking-client/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getAzureBookingPool } from './azure-booking.server';
import { databaseBackend } from '../azure/booking-config.mjs';

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient;
}

function createDatabaseClient(): PrismaClient {
  if (databaseBackend(process.env) === 'azure-postgres') {
    const adapter = new PrismaPg(getAzureBookingPool(), { schema: 'elunora_booking' });
    // Both generated schemas have identical models. Shopify's storage library
    // types require the default generated client even with an alternate provider.
    return new AzurePrismaClient({ adapter }) as unknown as PrismaClient;
  }
  return new PrismaClient();
}

if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = createDatabaseClient();
  }
}

const prisma = global.prismaGlobal ?? createDatabaseClient();

export default prisma;
