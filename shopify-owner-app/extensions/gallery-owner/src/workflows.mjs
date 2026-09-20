export const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;
export const MAX_PREVIEW_BYTES = 1024 * 1024;
export const STATUSES = ['submitted', 'preparing', 'ready', 'completed', 'cancelled'];
export function validatePhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > MAX_ORIGINAL_BYTES)
    throw Error('Use JPEG, PNG or WebP files up to 15 MB each.');
}
export async function uploadSigned(url, blob, fetcher = fetch) {
  const form = new FormData();
  form.append('cacheControl', '0');
  form.append('', blob);
  // The signed capability is sufficient. Never forward the owner's bearer token.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000);
  let response;
  try { response = await fetcher(url, {method: 'PUT', body: form, headers: {'x-upsert': 'false'}, signal: controller.signal}); }
  finally { clearTimeout(timeout); }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = Object.assign(new Error('File transfer failed. Please retry the failed photos.'), {status: response.status, code: body.error || body.code});
    throw error;
  }
}
export async function uploadPhoto(file, eventId, call, progress, transfer = uploadSigned) {
  validatePhoto(file);
  progress('Preparing secure upload');
  const prepared = await call('owner/events/' + eventId + '/upload', {filename: file.name, mime: file.type, bytes: file.size});
  progress('Uploading original');
  await transfer(prepared.originalUrl, file);
  progress('Creating preview on the server');
  await call('owner/events/' + eventId + '/photos/' + prepared.photoId, {action: 'process'});
}
export function linkedPayments(request, payments) {
  return payments.filter(payment => payment.lines?.some(line => line.request_id === request.id));
}
export function paymentReview(request, payments) {
  const linked = linkedPayments(request, payments);
  if (!linked.length) return 'No verified payment linked yet';
  const held = linked.length !== 1 || linked.some(p => p.is_test || p.cancelled || p.refund_activity || p.financial_status !== 'paid' || !p.lines?.length || p.lines.some(l => l.match_status !== 'matched'));
  return held ? 'Payment or selection review required' : 'Verified paid order';
}
export function formatBytes(bytes) {
  if (!bytes) return '0 MB';
  return bytes >= 1024 ** 3 ? (bytes / 1024 ** 3).toFixed(2) + ' GB' : (bytes / 1024 ** 2).toFixed(1) + ' MB';
}
export function accessState(access) {
  if (access.revoked) return 'Revoked';
  return Date.parse(access.expires_at) <= Date.now() ? 'Expired' : 'Active';
}
