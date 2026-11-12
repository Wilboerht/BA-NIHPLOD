import crypto from 'crypto';

const MIN_CRON_SECRET_LENGTH = 16;
let warnedMissingSecret = false;

/**
 * 定时任务鉴权：只接受请求头 x-cron-secret。
 * 未配置或密钥过短时 fail-closed，并避免向调用方暴露配置状态。
 */
export function isCronRequestAuthorized(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || expected.length < MIN_CRON_SECRET_LENGTH) {
    if (!warnedMissingSecret) {
      warnedMissingSecret = true;
      console.error(
        `[cron] CRON_SECRET 未配置或少于 ${MIN_CRON_SECRET_LENGTH} 字符，定时任务已拒绝执行`
      );
    }
    return false;
  }

  const provided = request.headers.get('x-cron-secret') || '';
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
