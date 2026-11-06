import { isIP } from 'node:net';

const MAX_IP_LENGTH = 64;

export function normalizeClientIp(value: string | null | undefined): string | null {
  if (!value) return null;

  const parts = value.split(',').map((part) => part.trim()).filter(Boolean);
  const candidate = parts.length > 0 ? parts[parts.length - 1] : null;
  if (!candidate || candidate.length > MAX_IP_LENGTH) return null;

  const withoutBrackets = candidate.startsWith('[') && candidate.endsWith(']')
    ? candidate.slice(1, -1)
    : candidate;

  return isIP(withoutBrackets) ? withoutBrackets : null;
}

export function getClientIp(headers: Pick<Headers, 'get'>): string {
  return normalizeClientIp(headers.get('x-real-ip'))
    ?? normalizeClientIp(headers.get('cf-connecting-ip'))
    ?? normalizeClientIp(headers.get('x-forwarded-for'))
    ?? 'unknown';
}

export function getClientIpFromRequest(request: Request): string {
  return getClientIp(request.headers);
}
