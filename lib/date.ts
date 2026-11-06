const configuredTimeZone = process.env.NEXT_PUBLIC_BUSINESS_TIME_ZONE;
let safeTimeZone = 'Asia/Shanghai';
if (configuredTimeZone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: configuredTimeZone });
    safeTimeZone = configuredTimeZone;
  } catch {
    safeTimeZone = 'Asia/Shanghai';
  }
}

export const BUSINESS_TIME_ZONE = safeTimeZone;

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function getDateISOInBusinessTimeZone(date: Date = new Date()): string {
  if (Number.isNaN(date.getTime())) return '';
  const parts = dateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  return year && month && day ? `${year}-${month}-${day}` : '';
}
