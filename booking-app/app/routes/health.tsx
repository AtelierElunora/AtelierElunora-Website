import db from '../db.server';

export async function loader() {
  try {
    await Promise.all([db.bookingSettings.count(), db.bookingPayment.count(), db.bookingMail.count()]);
    return Response.json({ state: 'booking-app-ready', release: 'booking-operations-2026-10-06' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ state: 'booking-app-unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
