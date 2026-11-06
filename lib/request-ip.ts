import { isIP } from 'node:net';

const MAX_IP_LENGTH = 64;

export function normalizeClientIp(value: string | null | undefined): string | null {
  if (!value) return null;

  const first = value.split(',')[0]?.trim();
  if (!first || first.length > MAX_IP_LENGTH) return null;

  const withoutBrackets = first.startsWith('[') && first.endsWith(']')
    ? first.slice(1, -1)
    : first;

  return isIP(withoutBrackets) ? withoutBrackets : null;
}

export function getClientIp(headers: Pick<Headers, 'get'>): string {
  return normalizeClientIp(headers.get('x-real-ip'))
    ?? normalizeClientIp(headers.get('x-forwarded-for'))
    ?? normalizeClientIp(headers.get('cf-connecting-ip'))
    ?? 'unknown';
}

export function getClientIpFromRequest(request: Request): string {
  return getClientIp(request.headers);
}
