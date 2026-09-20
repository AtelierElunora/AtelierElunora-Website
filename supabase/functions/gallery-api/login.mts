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
