import type {SupabaseClient, User} from '@supabase/supabase-js';
type Reply = (data: unknown, status?: number) => Response;
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// Only call after auth.getUser(token) has authenticated this exact token.
// Decoding by itself is NOT signature verification.
export function authenticatedAal(token: string): 'aal1' | 'aal2' {
  try {
    const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(encoded)).aal === 'aal2' ? 'aal2' : 'aal1';
  } catch { return 'aal1'; }
}

export async function ownerState(client: SupabaseClient, user: User, token: string) {
  const {data, error} = await client.from('gallery_admins').select('user_id,mfa_required').eq('user_id', user.id).maybeSingle();
  if (error) throw Error('Owner security status unavailable.');
  return {owner: Boolean(data), required: data?.mfa_required === true, aal: authenticatedAal(token),
    factors: (user.factors || []).filter(f => f.factor_type === 'totp' && f.status === 'verified')
      .map(f => ({id: f.id, name: f.friendly_name || 'Authenticator'}))};
}
export type OwnerState = Awaited<ReturnType<typeof ownerState>>;
export const needsMfa = (state: OwnerState) => state.owner && state.required && state.aal !== 'aal2';

export async function ownerMfa(path: string, method: string, body: Record<string, unknown>, client: SupabaseClient, user: User, state: OwnerState, reply: Reply) {
  if (!state.owner) return reply({error: 'Owner access required.'}, 403);
  if (path === 'mfa/status' && method === 'GET') return reply(state);
  if (method !== 'POST') return reply({error: 'Method not allowed.'}, 405);
  const failed = (error: {status?: number} | null, message: string) => reply({error: error?.status === 429 ? 'Please wait before trying another authenticator code.' : message}, error?.status === 429 ? 429 : 400);
  if (path === 'mfa/enroll') {
    if ((state.required || state.factors.length > 0) && state.aal !== 'aal2') return reply({error: 'Verify your existing authenticator before adding another.', code: 'MFA_REQUIRED'}, 403);
    const {data, error} = await client.auth.mfa.enroll({factorType: 'totp', issuer: 'Atelier Elunora Gallery', friendlyName: 'Gallery authenticator ' + crypto.randomUUID().slice(0, 8)});
    if (error || !data) return failed(error, 'Could not start authenticator setup. Please retry or contact the gallery administrator.');
    // The setup secret is only returned to this authenticated owner over TLS,
    // under the handler's no-store headers. Never log or persist it in the app.
    return reply({factorId: data.id, secret: data.totp.secret});
  }
  if (path === 'mfa/verify') {
    if (!uuid(body.factorId) || typeof body.code !== 'string' || !/^\d{6}$/.test(body.code)) return reply({error: 'Enter the six-digit authenticator code.'}, 400);
    // Supabase checks factor ownership, expiry, replay and rate limits.
    const {data, error} = await client.auth.mfa.challengeAndVerify({factorId: body.factorId, code: body.code});
    if (error || !data) return failed(error, 'That authenticator code is incorrect or expired. Try the next code.');
    const verified = await client.auth.getUser(data.access_token);
    if (verified.error || verified.data.user?.id !== user.id || authenticatedAal(data.access_token) !== 'aal2') return reply({error: 'Could not verify this owner session.'}, 401);
    return reply({access_token: data.access_token, refresh_token: data.refresh_token,
      expires_at: Math.floor(Date.now() / 1000) + data.expires_in, email: verified.data.user.email});
  }
  if (path === 'mfa/activate') {
    if (state.aal !== 'aal2' || state.factors.length === 0) return reply({error: 'Verify your authenticator first.', code: 'MFA_REQUIRED'}, 403);
    // Column grant + RLS permit only this owner's AAL2 session to set true.
    // There is no client-accessible operation that turns enforcement off.
    const {data, error} = await client.from('gallery_admins').update({mfa_required: true}).eq('user_id', user.id).select('mfa_required').single();
    if (error || data?.mfa_required !== true) return reply({error: 'Could not activate MFA protection. Please retry.'}, 503);
    return reply({required: true});
  }
  return reply({error: 'Not found.'}, 404);
}
