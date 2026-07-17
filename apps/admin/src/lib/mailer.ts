// apps/admin/src/lib/mailer.ts
// ==========================================
// Next.js (admin) 端 Email 寄送工具
//
// 設計原則：
// - 惰性 (lazy) 建立 transporter，避免缺少 SMTP 設定時於模組載入階段就拋錯。
// - 所有寄信皆為非同步且「永不拋出」：失敗一律 console.error 吞掉，
//   確保呼叫端（後台訂單狀態更新 API）的主流程與 HTTP 回應不受影響。
// - 信件 HTML 內容統一由 @havoice/shared 的模板產生器組裝，與 Express 端一致。
// - 僅於 Server 端（Route Handler）使用，不會被打包進前端 bundle。
// ==========================================
// 注意：本模組僅供 Server 端（Route Handler）使用，請勿於 Client Component 引入。
import nodemailer, { type Transporter } from 'nodemailer';
import {
  renderOrderShippedEmail,
  renderPaymentConfirmedEmail,
  renderOrderCreatedEmail,
  type OrderEmailData,
} from '@havoice/shared';

function maskEmail(value: string): string {
  const [localPart, domain] = value.trim().split('@');
  if (!localPart || !domain) return '[redacted-email]';
  return `${localPart.slice(0, 1)}***@${domain}`;
}

function summarizeMailError(value: unknown): { name: string; code?: string } {
  const error = value as { name?: unknown; code?: unknown } | null;
  return {
    name: typeof error?.name === 'string' ? error.name : 'UnknownError',
    ...(typeof error?.code === 'string' ? { code: error.code } : {}),
  };
}

let cachedTransporter: Transporter | null = null;
let transporterResolved = false;

function getTransporter(): Transporter | null {
  if (transporterResolved) return cachedTransporter;
  transporterResolved = true;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn(
      '[mailer] SMTP 環境變數不完整（需 SMTP_HOST / SMTP_USER / SMTP_PASS），Email 寄送將被略過。'
    );
    cachedTransporter = null;
    return null;
  }

  cachedTransporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return cachedTransporter;
}

function getFromAddress(): string | null {
  const configuredFrom = process.env.SMTP_FROM?.trim();
  if (configuredFrom) return configuredFrom;

  if (process.env.NODE_ENV === 'production') {
    console.warn('[mailer] production 環境缺少 SMTP_FROM，Email 寄送將被略過。');
    return null;
  }

  return process.env.SMTP_USER?.trim() || 'no-reply@example.com';
}

async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  try {
    if (!to) {
      console.error('[mailer] 收件人為空，略過寄送。');
      return false;
    }

    const transporter = getTransporter();
    if (!transporter) return false;

    const from = getFromAddress();
    if (!from) return false;

    await transporter.sendMail({ from, to, subject, html });
    console.log(`[mailer] ✅ 已寄出 Email 至 ${maskEmail(to)}`);
    return true;
  } catch (err) {
    console.error(
      `[mailer] ❌ Email 寄送失敗，收件者 ${maskEmail(to)}:`,
      summarizeMailError(err),
    );
    return false;
  }
}

/** 商品出貨通知信（含 trackingNumber） */
export async function sendOrderShippedEmail(to: string, data: OrderEmailData): Promise<void> {
  const { subject, html } = renderOrderShippedEmail(data);
  await sendMail(to, subject, html);
}

/** 付款成功確認信（保留供後台手動標記付款時使用） */
export async function sendPaymentConfirmedEmail(to: string, data: OrderEmailData): Promise<void> {
  const { subject, html } = renderPaymentConfirmedEmail(data);
  await sendMail(to, subject, html);
}

/** 訂單成立通知（保留供後台手動建單情境使用） */
export async function sendOrderCreatedEmail(to: string, data: OrderEmailData): Promise<void> {
  const { subject, html } = renderOrderCreatedEmail(data);
  await sendMail(to, subject, html);
}
