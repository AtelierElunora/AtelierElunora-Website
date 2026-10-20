import { ManagedIdentityCredential } from '@azure/identity';
import pg from 'pg';
import { bookingDatabaseConfig } from '../azure/booking-config.mjs';

let pool: pg.Pool | undefined;

// Deliberately opt-in: importing this file neither connects nor changes SQLite.
// The hosting resource must have this identity assigned and private VNet access.
export function getAzureBookingPool() {
  if (pool) return pool;
  const { identityClientId, ...config } = bookingDatabaseConfig(process.env);
  const credential = new ManagedIdentityCredential({ clientId: identityClientId });
  pool = new pg.Pool({
    ...config,
    password: async () => {
      const token = await credential.getToken('https://ossrdbms-aad.database.windows.net/.default');
      if (!token?.token) throw new Error('Azure booking authentication did not return a token');
      return token.token;
    },
  });
  // Do not log pg errors: they may contain SQL or customer information.
  pool.on('error', () => console.error('Azure booking database connection closed unexpectedly'));
  return pool;
}

// Read-only deployment preflight. Does not create tables or grant permissions.
export async function verifyAzureBookingDatabase() {
  const result = await getAzureBookingPool().query<{
    database: string; settings_ready: boolean; bookings_ready: boolean; sessions_ready: boolean;
  }>(`SELECT current_database() AS database,
    to_regclass('elunora_booking."BookingSettings"') IS NOT NULL AS settings_ready,
    to_regclass('elunora_booking."WeddingBooking"') IS NOT NULL AS bookings_ready,
    to_regclass('elunora_booking."Session"') IS NOT NULL AS sessions_ready`);
  const state = result.rows[0];
  if (!state?.settings_ready || !state.bookings_ready || !state.sessions_ready) {
    throw new Error('Azure booking schema is not ready; apply the reviewed migration before switching storage');
  }
  return state;
}

export async function closeAzureBookingPool() {
  const existing = pool;
  pool = undefined;
  await existing?.end();
}
