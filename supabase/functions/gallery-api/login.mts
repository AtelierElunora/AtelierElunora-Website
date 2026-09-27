import type {SupabaseClient, User, Session} from '@supabase/supabase-js';
import type {OwnerState} from './owner-mfa.mts';
type LoginClient = {auth: {signInWithOtp: (input: {email: string; options: {shouldCreateUser: boolean; captchaToken?: string}}) => Promise<{error: {status?: number; code?: string} | null}>}};
type Reply = (data: unknown, status?: number) => Response;

// Supabase Auth validates the token with Cloudflare once CAPTCHA is enabled.
// Missing tokens remain compatible during the staged rollout; Auth rejects
// them after enforcement is enabled. No owner-email exemption is permitted.
export async function requestEmailCode(client: LoginClient, email: string, token: unknown, reply: Reply) {
  if (token !== undefined && (typeof token !== 'string' || !token.trim() || token.length > 2048)) {
    return reply({error: 'Complete the security check and try again.', code: 'CAPTCHA_FAILED'}, 400);
  }
  const {error} = await client.auth.signInWithOtp({email, options: {
    shouldCreateUser: true, ...(typeof token === 'string' ? {captchaToken: token} : {})
  }});
  if (error?.code === 'captcha_failed') return reply({error: 'The security check expired or could not be verified. Complete it again.', code: 'CAPTCHA_FAILED'}, 400);
  if (error?.status === 429) return reply({error: 'Please wait before requesting another code.'}, 429);
  if (error && error.status && error.status >= 500) return reply({error: 'Email delivery is temporarily unavailable.'}, 503);
  return reply({message: 'If this email has gallery access, an eight-digit code will arrive shortly.'});
}


const sessionReply = (s: Session) => ({access_token:s.access_token, refresh_token:s.refresh_token, expires_at:s.expires_at, email:s.user.email});

export async function signInWithPassword(client: SupabaseClient, email: string, password: unknown, token: unknown, reply: Reply) {
  if (typeof password !== 'string' || !password || password.length > 128) return reply({error:'Enter your password.'},400);
  if (typeof token !== 'string' || !token.trim() || token.length > 2048) return reply({error:'Complete the security check and try again.',code:'CAPTCHA_FAILED'},400);
  const {data,error} = await client.auth.signInWithPassword({email,password,options:{captchaToken:token}});
  if (error?.code === 'captcha_failed') return reply({error:'Complete a new security check and try again.',code:'CAPTCHA_FAILED'},400);
  if (error?.status === 429) return reply({error:'Please wait before trying to sign in again.'},429);
  if (error?.status && error.status >= 500) return reply({error:'Sign-in is temporarily unavailable. Please try again.'},503);
  // Never reveal whether an email exists, has a password, or is unconfirmed.
  if (error || !data.session) return reply({error:'Email or password was not accepted. Try again, use an email code, or create/reset your password.'},400);
  return reply(sessionReply(data.session));
}

// The handler must first authenticate this exact JWT using getUser, check the
// active session, and load server-controlled owner status. Decoding is not auth.
export function recentEmailVerification(token: string, userId: string, now = Date.now()/1000) {
  try {
    const claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
    return claims.sub === userId && Array.isArray(claims.amr) && claims.amr.some((entry: {method?:string; timestamp?:number}) =>
      ['otp','email/signup'].includes(entry.method || '') && typeof entry.timestamp === 'number' &&
      entry.timestamp <= now + 30 && entry.timestamp > now - 600);
  } catch { return false; }
}

export async function setPassword(client: SupabaseClient, user: User, security: OwnerState, accessToken: string, body: Record<string,unknown>, reply: Reply) {
  if (security.owner && security.aal !== 'aal2') return reply({error:'Verify your authenticator in the owner studio first.',code:'MFA_REQUIRED'},403);
  if (user.is_anonymous || !user.email || !user.email_confirmed_at || !recentEmailVerification(accessToken,user.id)) {
    return reply({error:'For your security, sign out and choose Create or reset password to verify a new email code.',code:'EMAIL_VERIFICATION_REQUIRED'},403);
  }
  if (typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 128) return reply({error:'Use a password between 12 and 128 characters.'},400);
  if (typeof body.refresh_token !== 'string' || !body.refresh_token || body.refresh_token.length > 2048) return reply({error:'Please sign in again.'},401);
  const restored=await client.auth.setSession({access_token:accessToken,refresh_token:body.refresh_token});
  if (restored.error || !restored.data.session || restored.data.user?.id !== user.id) return reply({error:'Please sign in again.'},401);
  const {data,error}=await client.auth.updateUser({password:body.password});
  if (error?.status === 429) return reply({error:'Please wait before trying to save your password again.'},429);
  if (error?.code === 'same_password') return reply({error:'Choose a password different from your current password.'},400);
  if (error?.code === 'weak_password') return reply({error:'Choose a stronger password, such as a longer unique passphrase.'},400);
  if (error || data.user?.id !== user.id) return reply({error:'Could not save your password. Request a new email code and try again.'},400);
  return reply(sessionReply(restored.data.session));
}
