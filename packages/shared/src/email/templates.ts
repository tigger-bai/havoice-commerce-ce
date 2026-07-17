// packages/shared/src/email/templates.ts
// ==========================================
// 共用 Email HTML 模板產生器（純函式、無任何 Node/nodemailer 依賴）
//
// 設計原則：
// - 此模組僅負責「組裝信件主旨與 HTML 內容」，不負責寄送。
// - 不引入 nodemailer 或任何 Node-only 模組，確保前端 / Edge / Node 皆可安全引用，
//   不污染 bundle、不破壞既有型別對齊。
// - Express 端 (apps/api) 與 Next.js 端 (apps/admin) 各自的 mailer utility
//   會呼叫這裡的產生器，確保雙邊信件內容一致。
// - 所有模板皆採 table-based 排版 + inline style，最大化各家郵件客戶端相容性與 RWD。
// ==========================================

/** 單筆訂單明細項目（寄信用，最小必要欄位） */
export interface OrderEmailItem {
  productName: string;
  productPrice: number;
  quantity: number;
}

/** 組裝信件所需的訂單資料（雙邊共用的最小契約） */
export interface OrderEmailData {
  /** 訂單編號，例如 JY20260628ABCDEF */
  orderNumber: string;
  /** 收件人 / 會員稱呼 */
  customerName?: string | null;
  /** 訂單總金額 */
  totalAmount: number;
  /** 付款方式，例如 CREDIT_CARD / COD / ATM */
  paymentMethod?: string | null;
  /** 商品明細 */
  items: OrderEmailItem[];
  /** 收件地址（選填） */
  shippingAddress?: string | null;
  /** 物流追蹤碼（出貨信專用） */
  trackingNumber?: string | null;
  /** 商店前台網址（用於信中按鈕連結，選填） */
  webBaseUrl?: string | null;
}

/** 寄信內容（主旨 + HTML），由各端 mailer 直接傳入 nodemailer */
export interface RenderedEmail {
  subject: string;
  html: string;
}

const BRAND = {
  name: 'Havoice 快樂之音',
  supportEmail: 'contact@example.com',
  primary: '#16a34a', // 品牌綠 (brand-600)
  primaryLight: '#f0fdf4', // brand-50
  text: '#1f2937',
  subText: '#6b7280',
  border: '#e5e7eb',
};

/** 統一的金額格式：NT$ 1,234 */
function formatPrice(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `NT$ ${safe.toLocaleString('en-US')}`;
}

/** HTML 跳脫，避免使用者資料破壞版面或造成注入 */
function escapeHtml(input: unknown): string {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 商品明細表格（共用片段） */
function renderItemsTable(items: OrderEmailItem[]): string {
  const rows = items
    .map((item) => {
      const subtotal = item.productPrice * item.quantity;
      return `
        <tr>
          <td style="padding:12px 8px;border-bottom:1px solid ${BRAND.border};color:${BRAND.text};font-size:14px;">
            ${escapeHtml(item.productName)}
          </td>
          <td style="padding:12px 8px;border-bottom:1px solid ${BRAND.border};color:${BRAND.subText};font-size:14px;text-align:center;white-space:nowrap;">
            ${formatPrice(item.productPrice)} &times; ${escapeHtml(item.quantity)}
          </td>
          <td style="padding:12px 8px;border-bottom:1px solid ${BRAND.border};color:${BRAND.text};font-size:14px;text-align:right;white-space:nowrap;font-weight:600;">
            ${formatPrice(subtotal)}
          </td>
        </tr>`;
    })
    .join('');

  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0;">
      <thead>
        <tr>
          <th align="left" style="padding:8px;border-bottom:2px solid ${BRAND.border};color:${BRAND.subText};font-size:12px;font-weight:600;">商品</th>
          <th align="center" style="padding:8px;border-bottom:2px solid ${BRAND.border};color:${BRAND.subText};font-size:12px;font-weight:600;">單價 / 數量</th>
          <th align="right" style="padding:8px;border-bottom:2px solid ${BRAND.border};color:${BRAND.subText};font-size:12px;font-weight:600;">小計</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>`;
}

/** 外層信件骨架（RWD：max-width 600px + 流動寬度） */
function renderShell(args: { title: string; preheader: string; bodyHtml: string }): string {
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>${escapeHtml(args.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;-webkit-text-size-adjust:100%;">
  <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;">
    ${escapeHtml(args.preheader)}
  </span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color:${BRAND.primary};padding:24px 32px;">
              <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">${BRAND.name}</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${args.bodyHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px;background-color:#fafafa;border-top:1px solid ${BRAND.border};">
              <p style="margin:0;color:${BRAND.subText};font-size:12px;line-height:1.6;">
                本信件由系統自動發送，請勿直接回覆。<br />
                如有任何問題，歡迎聯繫客服：${BRAND.supportEmail}
              </p>
              <p style="margin:8px 0 0;color:#9ca3af;font-size:12px;">
                &copy; ${new Date().getFullYear()} ${BRAND.name}. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderGreeting(name?: string | null): string {
  return `<p style="margin:0 0 16px;color:${BRAND.text};font-size:16px;">親愛的 ${escapeHtml(name || '會員')}，您好：</p>`;
}

function renderTotalRow(label: string, totalAmount: number): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;">
      <tr>
        <td style="padding:12px 8px;color:${BRAND.text};font-size:15px;font-weight:700;">${escapeHtml(label)}</td>
        <td style="padding:12px 8px;color:${BRAND.primary};font-size:18px;font-weight:700;text-align:right;">${formatPrice(totalAmount)}</td>
      </tr>
    </table>`;
}

function normalizePaymentMethod(method?: string | null): string {
  return String(method || '').trim().toUpperCase();
}

function getPaymentMethodLabel(method?: string | null): string {
  switch (normalizePaymentMethod(method)) {
    case 'CREDIT_CARD':
      return '信用卡付款';
    case 'COD':
      return '貨到付款';
    case 'ATM':
      return 'ATM 轉帳';
    default:
      return method ? String(method) : '未指定';
  }
}

function getOrderCreatedMessage(data: OrderEmailData): string {
  const paymentLabel = getPaymentMethodLabel(data.paymentMethod);

  if (normalizePaymentMethod(data.paymentMethod) === 'COD') {
    return `您的訂單已成功成立！本筆訂單採「<strong>${escapeHtml(paymentLabel)}</strong>」，商品將於備貨完成後為您安排出貨，屆時請於收貨時準備好應付款項。`;
  }

  return `您的訂單已成功成立！本筆訂單付款方式為「<strong>${escapeHtml(paymentLabel)}</strong>」，請依付款流程完成款項後，我們將為您安排後續處理。`;
}

function getOrderCreatedTotalLabel(method?: string | null): string {
  const paymentLabel = getPaymentMethodLabel(method);
  return normalizePaymentMethod(method) === 'COD'
    ? '應付總計（貨到付款）'
    : `訂單總計（${paymentLabel}）`;
}

function renderOrderInfoBox(data: OrderEmailData, extraRows = ''): string {
  const addressRow = data.shippingAddress
    ? `<p style="margin:4px 0;color:${BRAND.subText};font-size:14px;">配送地址：<span style="color:${BRAND.text};">${escapeHtml(data.shippingAddress)}</span></p>`
    : '';
  return `
    <div style="background-color:${BRAND.primaryLight};border-radius:12px;padding:16px 20px;margin:16px 0;">
      <p style="margin:4px 0;color:${BRAND.subText};font-size:14px;">訂單編號：<span style="color:${BRAND.text};font-weight:600;font-family:monospace;">${escapeHtml(data.orderNumber)}</span></p>
      ${addressRow}
      ${extraRows}
    </div>`;
}

// ==========================================
// 三種對外模板
// ==========================================

/** 1. 訂單成立通知 */
export function renderOrderCreatedEmail(data: OrderEmailData): RenderedEmail {
  const paymentLabel = getPaymentMethodLabel(data.paymentMethod);
  const paymentMethodRow = `<p style="margin:4px 0;color:${BRAND.subText};font-size:14px;">付款方式：<span style="color:${BRAND.text};">${escapeHtml(paymentLabel)}</span></p>`;
  const body = `
    ${renderGreeting(data.customerName)}
    <p style="margin:0 0 8px;color:${BRAND.text};font-size:15px;line-height:1.7;">
      ${getOrderCreatedMessage(data)}
    </p>
    ${renderOrderInfoBox(data, paymentMethodRow)}
    ${renderItemsTable(data.items)}
    ${renderTotalRow(getOrderCreatedTotalLabel(data.paymentMethod), data.totalAmount)}
  `;
  return {
    subject: `【${BRAND.name}】訂單成立通知 - ${data.orderNumber}`,
    html: renderShell({
      title: '訂單成立通知',
      preheader: `您的訂單 ${data.orderNumber} 已成立（${paymentLabel}）`,
      bodyHtml: body,
    }),
  };
}

/** 2. 付款成功確認信（已收到款項） */
export function renderPaymentConfirmedEmail(data: OrderEmailData): RenderedEmail {
  const body = `
    ${renderGreeting(data.customerName)}
    <p style="margin:0 0 8px;color:${BRAND.text};font-size:15px;line-height:1.7;">
      我們已成功收到您的款項，感謝您的購買！以下是您本次訂單的明細，我們將盡快為您安排出貨。
    </p>
    ${renderOrderInfoBox(data)}
    ${renderItemsTable(data.items)}
    ${renderTotalRow('已付款金額', data.totalAmount)}
  `;
  return {
    subject: `【${BRAND.name}】付款成功確認 - ${data.orderNumber}`,
    html: renderShell({
      title: '付款成功確認',
      preheader: `我們已收到訂單 ${data.orderNumber} 的款項`,
      bodyHtml: body,
    }),
  };
}

/** 3. 商品出貨通知信（必含 trackingNumber） */
export function renderOrderShippedEmail(data: OrderEmailData): RenderedEmail {
  const trackingBox = data.trackingNumber
    ? `<p style="margin:4px 0;color:${BRAND.subText};font-size:14px;">物流追蹤碼：<span style="color:${BRAND.primary};font-weight:700;font-family:monospace;">${escapeHtml(data.trackingNumber)}</span></p>`
    : '';
  const body = `
    ${renderGreeting(data.customerName)}
    <p style="margin:0 0 8px;color:${BRAND.text};font-size:15px;line-height:1.7;">
      您的訂單商品已出貨！您可使用下方的物流追蹤碼查詢包裹配送進度。
    </p>
    ${renderOrderInfoBox(data, trackingBox)}
    ${renderItemsTable(data.items)}
    ${renderTotalRow('訂單總計', data.totalAmount)}
  `;
  return {
    subject: `【${BRAND.name}】商品出貨通知 - ${data.orderNumber}`,
    html: renderShell({
      title: '商品出貨通知',
      preheader: `您的訂單 ${data.orderNumber} 已出貨`,
      bodyHtml: body,
    }),
  };
}
