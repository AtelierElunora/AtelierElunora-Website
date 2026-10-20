// Connection metadata only. Passwords and bearer tokens never belong here.
export function databaseBackend(env) {
  const backend = env.ELUNORA_DATABASE_BACKEND || 'sqlite';
  if (!['sqlite', 'azure-postgres'].includes(backend)) throw new Error('Unknown booking database backend');
  return backend;
}

export function bookingDatabaseConfig(env) {
  const required = ['ELUNORA_PG_HOST', 'ELUNORA_PG_DATABASE', 'ELUNORA_PG_USER', 'ELUNORA_PG_IDENTITY_CLIENT_ID'];
  for (const name of required) {
    if (!env[name]?.trim()) throw new Error(`Missing Azure booking configuration: ${name}`);
  }
  const host = env.ELUNORA_PG_HOST.trim();
  if (!/^[a-z0-9-]+\.postgres\.database\.azure\.com$/i.test(host)) {
    throw new Error('Booking database must use an Azure PostgreSQL server hostname');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(env.ELUNORA_PG_IDENTITY_CLIENT_ID)) {
    throw new Error('Booking managed identity client ID must be a UUID');
  }
  return {
    host,
    database: env.ELUNORA_PG_DATABASE.trim(),
    user: env.ELUNORA_PG_USER.trim(),
    identityClientId: env.ELUNORA_PG_IDENTITY_CLIENT_ID,
    port: 5432,
    ssl: { rejectUnauthorized: true },
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    statement_timeout: 10000,
    application_name: 'atelier-elunora-bookings',
  };
}
