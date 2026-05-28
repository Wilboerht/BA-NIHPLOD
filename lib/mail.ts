import { Resend } from 'resend';

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

const FROM_EMAIL = process.env.MAIL_FROM || 'noreply@nihplod.cn';

interface MailOptions {
  to: string | string[];
  subject: string;
  text: string;
  html?: string;
}

/**
 * 发送邮件（异步，失败静默）
 * 生产环境需要配置 RESEND_API_KEY，否则只打印日志
 */
export async function sendMail(options: MailOptions): Promise<void> {
  if (!resend) {
    console.warn('[Mail] RESEND_API_KEY 未配置，邮件未发送');
    console.warn('[Mail] To:', options.to, '| Subject:', options.subject);
    return;
  }

  try {
    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });

    if (error) {
      console.error('[Mail] 发送失败:', error);
    } else {
      console.log('[Mail] 发送成功:', data?.id);
    }
  } catch (err: unknown) {
    console.error('[Mail] 异常:', err instanceof Error ? err.message : String(err));
  }
}

/**
 * 新提报邮件通知管理员
 */
export function sendPendingCertNotification(params: {
  adminEmails: string[];
  shopName: string;
  companyName?: string;
  phone?: string;
  scopeText?: string;
  certNumber: string;
  auditorName: string;
  duration: string;
  baseUrl: string;
}): void {
  const { adminEmails, shopName, companyName, phone, scopeText, certNumber, auditorName, duration, baseUrl } = params;
  if (adminEmails.length === 0) return;
  console.log('[Mail] 准备发送待审核通知给:', adminEmails.join(', '));
  const dashboardUrl = `${baseUrl}/workbench/certificates`;

  const text = `有新的授权资质申请待审核

━━━━━━━━━━━━━━━━━━━━
店铺/平台名称：${shopName}
公司名称：${companyName || '未填写'}
联系电话：${phone || '未填写'}
授权范围：${scopeText || '未填写'}
证书编号：${certNumber}
提报人：${auditorName}
有效期：${duration}
━━━━━━━━━━━━━━━━━━━━

请登录管理后台核查：
${dashboardUrl}

—— NIHPLOD 品牌授权管理平台`;

  // 异步发送，不阻塞主流程
  sendMail({
    to: adminEmails,
    subject: `【待审核】${shopName} 提交了授权资质申请`,
    text,
  }).catch((err) => {
    console.error('[Mail] 通知发送失败:', err);
  });
}
