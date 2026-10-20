import test from 'node:test';
import assert from 'node:assert/strict';
import { bookingDatabaseConfig, databaseBackend } from './booking-config.mjs';

const valid = {
  ELUNORA_PG_HOST: 'example.postgres.database.azure.com',
  ELUNORA_PG_DATABASE: 'example_database',
  ELUNORA_PG_USER: 'booking_identity',
  ELUNORA_PG_IDENTITY_CLIENT_ID: '00000000-0000-4000-8000-000000000001',
};
test('requires explicit configuration instead of silently using another database', () => {
  for (const key of Object.keys(valid)) {
    const env = { ...valid }; delete env[key];
    assert.throws(() => bookingDatabaseConfig(env), new RegExp(key));
  }
});
test('rejects a URL containing credentials or a non-Azure destination', () => {
  for (const host of ['postgres://user:secret@example.com/db', 'localhost', 'example.com']) {
    assert.throws(() => bookingDatabaseConfig({ ...valid, ELUNORA_PG_HOST: host }));
  }
});
test('enforces certificate verification and excludes supplied passwords', () => {
  const config = bookingDatabaseConfig({ ...valid, PGPASSWORD: 'unused', PGSSLMODE: 'disable' });
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal('password' in config, false);
});
test('requires a concrete managed identity client ID', () => {
  assert.throws(() => bookingDatabaseConfig({ ...valid, ELUNORA_PG_IDENTITY_CLIENT_ID: 'unknown' }));
});
test('Azure selection is explicit and unknown backends cannot fall back to SQLite', () => {
  assert.equal(databaseBackend({}), 'sqlite');
  assert.equal(databaseBackend({ ELUNORA_DATABASE_BACKEND: 'azure-postgres' }), 'azure-postgres');
  assert.throws(() => databaseBackend({ ELUNORA_DATABASE_BACKEND: 'azure' }));
});
