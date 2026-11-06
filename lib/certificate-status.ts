import { getTodayISO } from './validation.ts';

export type EffectiveCertificateStatus = 'ISSUED' | 'UPCOMING' | 'EXPIRED' | 'REVOKED';

export function getEffectiveCertificateStatus(
  rawStatus: string | null | undefined,
  startDate: string,
  endDate: string,
  today: string = getTodayISO()
): EffectiveCertificateStatus | null {
  const status = String(rawStatus || '').toUpperCase();
  if (status === 'REVOKED') return 'REVOKED';
  if (status === 'EXPIRED') return 'EXPIRED';
  if (status !== 'ISSUED') return null;
  if (startDate > today) return 'UPCOMING';
  if (endDate < today) return 'EXPIRED';
  return 'ISSUED';
}
