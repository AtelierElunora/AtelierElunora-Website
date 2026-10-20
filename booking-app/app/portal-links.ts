import { timingSafeEqual } from "node:crypto";
type Link = { hash: string; expiresAt: string };
export function addEmailPortalLink(existing: unknown, hash: string, now = Date.now()): Link[] {
  const links: Link[] = Array.isArray(existing) ? existing.filter(x => x && /^[a-f0-9]{64}$/.test(x.hash) && Date.parse(x.expiresAt) > now) : [];
  return [...links, { hash, expiresAt: new Date(now + 30 * 86400000).toISOString() }];
}
export function validPortalLink(details: {portalHash?: string; portalExpiresAt?: string; emailPortalLinks?: Link[]}, candidate: string, now = Date.now()): boolean {
  if (!/^[a-f0-9]{64}$/.test(candidate)) return false;
  const links = [{hash: details.portalHash, expiresAt: details.portalExpiresAt}, ...(Array.isArray(details.emailPortalLinks) ? details.emailPortalLinks : [])];
  return links.some(link => link && typeof link.hash === "string" && /^[a-f0-9]{64}$/.test(link.hash) && Number.isFinite(Date.parse(link.expiresAt || "")) && Date.parse(link.expiresAt || "") > now && timingSafeEqual(Buffer.from(link.hash, "hex"), Buffer.from(candidate, "hex")));
}
