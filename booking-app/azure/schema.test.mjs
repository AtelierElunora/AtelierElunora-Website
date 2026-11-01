import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('booking schema coexists with website tables and keeps prepayment separate from total', async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE SCHEMA customer; CREATE TABLE customer.accounts (id text PRIMARY KEY); INSERT INTO customer.accounts VALUES ('website-sentinel');");
    await db.exec(await readFile(new URL('./initial-booking-schema.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('./booking-operations.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('./booking-leads.sql', import.meta.url), 'utf8'));
    await db.query(`INSERT INTO elunora_booking."BookingLead" (id,shop,"tokenHash","customerName","customerEmail","consentAt","updatedAt") VALUES ('synthetic-lead','dev.myshopify.com','synthetic-hash','Synthetic inquiry','test@example.invalid',now(),now())`);
    const {rows:leads}=await db.query('SELECT status,"bookingId" FROM elunora_booking."BookingLead"');
    assert.deepEqual(leads,[{status:'new',bookingId:null}]);
    await db.query(`INSERT INTO elunora_booking."BookingSettings" (shop,"updatedAt") VALUES ($1,now())`, ['dev.myshopify.com']);
    const { rows: settings } = await db.query('SELECT * FROM elunora_booking."BookingSettings"');
    assert.equal(settings[0].prepaymentPercent, 30);
    await db.query(`INSERT INTO elunora_booking."WeddingBooking"
      (id,shop,"weddingDate","customerName","customerEmail",venue,"totalCents","paidCents","updatedAt")
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())`,
      ['synthetic-booking', 'dev.myshopify.com', '2027-06-01', 'Synthetic customer', 'test@example.invalid', 'Test venue', 100000, 30000]);
    const { rows: bookings } = await db.query('SELECT "totalCents"-"paidCents" AS remaining FROM elunora_booking."WeddingBooking"');
    assert.equal(bookings[0].remaining, 70000);
    const { rows: accounts } = await db.query('SELECT id FROM customer.accounts');
    assert.deepEqual(accounts, [{ id: 'website-sentinel' }]);
    await db.query(`INSERT INTO elunora_booking."Session" (id,shop,state,"accessToken") VALUES ($1,$2,$3,$4)`,
      ['synthetic-session', 'dev.myshopify.com', 'synthetic-state', 'synthetic-token']);
    const { rows: sessions } = await db.query('SELECT "isOnline", "accountOwner" FROM elunora_booking."Session"');
    assert.deepEqual(sessions, [{ isOnline: false, accountOwner: false }]);
  } finally { await db.close(); }
});
