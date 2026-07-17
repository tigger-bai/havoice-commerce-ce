// apps/api/src/services/logistics.service.ts
// 綠界物流 C2C 交貨便「全自動拋單」Service（純加法外掛）。
// 設計原則：
// - 完全不更動既有金流 AIO Webhook、E-Map 門市回拋、登入驗證等已運作邏輯。
// - 物流 CheckMacValue 重用 @havoice/shared 的 MD5 工具（單一來源）。
// - 嚴格邊界防護：冪等性（已有 shippingTrackingNumber 報錯）、付款狀態防禦（僅 COD 或 PAID 可拋單）。
import { prisma, type Prisma } from '@havoice/database';
import { generateLogisticsCheckMacValue } from '@havoice/shared';
import { AppError } from '../utils/app-error';

/**
 * 綠界物流子類型 → C2C 類型對照表。
 * 後台拋單時必須使用 C2C 格式（交貨便）。
 */
const SUBTYPE_TO_C2C: Record<string, string> = {
  UNIMART: 'UNIMARTC2C',
  FAMI: 'FAMIC2C',
  HILIFE: 'HILIFEC2C',
  OKMART: 'OKMARTC2C',
  OK: 'OKMARTC2C',
};

const isProduction = process.env.NODE_ENV === 'production';

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.replace(/["']/g, '').trim();
  return value || undefined;
}

function getLogisticsEnv(name: string, devFallback?: string): string {
  const value = optionalEnv(name);

  if (value) {
    return value;
  }

  if (!isProduction && devFallback) {
    return devFallback;
  }

  throw new AppError(500, `缺少必要物流環境變數：${name}`, 'ENV_MISSING');
}

/**
 * 解析從訂單推導出的物流子類型。
 * 來源優先序：
 * 1. order.cvsSubType（新欄位，建單時寫入）
 * 2. shippingAddress 開頭品牌字串還原（向後相容舊資料）
 */
function resolveSubType(order: { cvsSubType: string | null; shippingAddress: string }): string | null {
  if (order.cvsSubType && SUBTYPE_TO_C2C[order.cvsSubType.toUpperCase()]) {
    return order.cvsSubType.toUpperCase();
  }
  const addr = order.shippingAddress || '';
  if (addr.includes('7-ELEVEN') || addr.includes('7-11') || addr.includes('統一') || addr.includes('UNIMART')) return 'UNIMART';
  if (addr.includes('全家') || addr.includes('FamilyMart') || addr.includes('FAMI')) return 'FAMI';
  if (addr.includes('萊爾富') || addr.includes('Hi-Life') || addr.includes('HILIFE')) return 'HILIFE';
  if (addr.includes('OK') || addr.includes('OKMART')) return 'OK';
  return null;
}

/**
 * 從訂單推導取貨門市代號（ReceiverStoreID）。
 * 優先讀 order.cvsStoreId（新欄位），否則自 shippingAddress 中「門市代號 XXXXXX」regex 還原（向後相容）。
 */
function resolveStoreId(order: { cvsStoreId: string | null; shippingAddress: string }): string | null {
  if (order.cvsStoreId && order.cvsStoreId.trim()) return order.cvsStoreId.trim();
  const m = (order.shippingAddress || '').match(/門市代號\s*([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}

/**
 * 從訂單 notes（建單時寫入的 JSON 快照）解析收件人姓名與手機。
 * 綠界 C2C 對 ReceiverName 有中英數限制、ReceiverCellular 須為手機格式。
 */
function resolveReceiver(order: {
  notes: string | null;
  user: { name: string | null; phone: string | null } | null;
}): { name: string; cellular: string } {
  let name = '';
  let cellular = '';
  try {
    if (order.notes) {
      const parsed = JSON.parse(order.notes);
      if (parsed && typeof parsed === 'object') {
        name = String(parsed.recipientName || '');
        cellular = String(parsed.recipientPhone || '');
      }
    }
  } catch {
    /* notes 非 JSON 時忽略，改用 user 後備 */
  }
  if (!name) name = order.user?.name || '收件人';
  if (!cellular) cellular = order.user?.phone || '';
  // 綠界 ReceiverName 長度限制：取 4~10 字較安全，過長截斷
  const safeName = name.replace(/[^\u4e00-\u9fa5A-Za-z]/g, '').slice(0, 10) || '收件人';
  return { name: safeName, cellular };
}

/**
 * 解析綠界物流 Create API 的回應字串。
 * 成功格式：`1|MerchantID=...&AllPayLogisticsID=...&CVSPaymentNo=...&CVSValidationNo=...`
 * 失敗格式：`0|錯誤訊息`
 */
function parseLogisticsResponse(text: string): {
  ok: boolean;
  message: string;
  data: Record<string, string>;
} {
  const raw = (text || '').trim();
  const sepIdx = raw.indexOf('|');
  const code = sepIdx >= 0 ? raw.slice(0, sepIdx) : raw;
  const rest = sepIdx >= 0 ? raw.slice(sepIdx + 1) : '';

  if (code !== '1') {
    return { ok: false, message: rest || '綠界物流建立失敗', data: {} };
  }

  const data: Record<string, string> = {};
  for (const pair of rest.split('&')) {
    const eq = pair.indexOf('=');
    if (eq > 0) data[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return { ok: true, message: 'OK', data };
}

export class LogisticsService {
  /**
   * 一鍵產生綠界超商寄件代碼（C2C 交貨便全自動拋單）。
   *
   * @param orderId 訂單 ID
   * @returns 更新後的物流代碼欄位
   * @throws AppError 邊界條件未通過或綠界回應失敗
   */
  static async createC2CShipment(orderId: string, actorId?: string) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        user: { select: { name: true, email: true, phone: true } },
      },
    });

    if (!order) {
      throw new AppError(404, '訂單不存在', 'ORDER_NOT_FOUND');
    }

    // ─── 邊界防護 1：冪等性 ───
    if (order.shippingTrackingNumber) {
      throw new AppError(409, '此訂單已取得寄件編號，請勿重複申請', 'LOGISTICS_ALREADY_CREATED');
    }

    // ─── 邊界防護 2：僅超商取貨訂單可拋 C2C ───
    if (order.shippingMethod !== 'STORE') {
      throw new AppError(400, '僅超商取貨訂單可申請交貨便寄件代碼', 'NOT_CVS_ORDER');
    }

    // ─── 邊界防護 3：付款狀態 ───
    // 只有貨到付款（COD）或線上已付款（paymentStatus=PAID）才允許申請，
    // 防止未付款的信用卡 / ATM 訂單被誤出貨。
    const isCOD = order.paymentMethod === 'COD';
    const isPaid = order.paymentStatus === 'PAID';
    if (!isCOD && !isPaid) {
      throw new AppError(400, '此訂單尚未付款，無法申請物流寄件代碼', 'ORDER_NOT_PAID');
    }

    // ─── 推導必要欄位 ───
    const subType = resolveSubType(order);
    if (!subType) {
      throw new AppError(400, '無法判讀超商類型，請確認訂單門市資訊', 'CVS_SUBTYPE_UNKNOWN');
    }
    const logisticsSubType = SUBTYPE_TO_C2C[subType];

    const storeId = resolveStoreId(order);
    if (!storeId) {
      throw new AppError(400, '無法取得取貨門市代號，請確認訂單門市資訊', 'CVS_STORE_ID_MISSING');
    }

    const { name: receiverName, cellular: receiverCellular } = resolveReceiver(order);
    if (!receiverCellular || !/^09\d{8}$/.test(receiverCellular)) {
      throw new AppError(400, '收件人手機格式不正確，無法拋單', 'RECEIVER_CELLULAR_INVALID');
    }

    // ─── 綠界商店與寄件人設定 ───
    // production 必須明確設定正式環境變數，避免誤用測試商店代號或 localhost webhook。
    const MERCHANT_ID = getLogisticsEnv(
      'ECPAY_LOGISTICS_MERCHANT_ID',
      optionalEnv('ECPAY_MERCHANT_ID') || '2000132',
    );
    const HASH_KEY = getLogisticsEnv(
      'ECPAY_LOGISTICS_HASH_KEY',
      optionalEnv('ECPAY_HASH_KEY') || '5294y06JbISpM5x9',
    );
    const HASH_IV = getLogisticsEnv(
      'ECPAY_LOGISTICS_HASH_IV',
      optionalEnv('ECPAY_HASH_IV') || 'v77hoKGq4kWxNNIS',
    );
    const API_URL = getLogisticsEnv('API_BASE_URL', 'http://localhost:4000');
    const LOGISTICS_URL = getLogisticsEnv(
      'ECPAY_LOGISTICS_URL',
      'https://logistics-stage.ecpay.com.tw/Express/Create',
    );
    const SENDER_NAME = getLogisticsEnv('SENDER_NAME');
    const SENDER_PHONE = getLogisticsEnv('SENDER_PHONE');

    const amount = Math.round(Number(order.totalAmount));

    // 綠界物流交易時間格式：yyyy/MM/dd HH:mm:ss
    const now = new Date();
    const pad = (n: number) => (n < 10 ? `0${n}` : n.toString());
    const tradeDate = `${now.getFullYear()}/${pad(now.getMonth() + 1)}/${pad(now.getDate())} ${pad(
      now.getHours(),
    )}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    // 物流交易編號（綠界要求唯一、英數，上限 20 碼）：以訂單號 + 時間戳後綴保唯一
    const merchantTradeNo = `${order.orderNumber}${now.getTime().toString().slice(-6)}`.slice(0, 20);

    const params: Record<string, string> = {
      MerchantID: MERCHANT_ID,
      MerchantTradeNo: merchantTradeNo,
      MerchantTradeDate: tradeDate,
      LogisticsType: 'CVS',
      LogisticsSubType: logisticsSubType,
      GoodsAmount: amount.toString(),
      // IsCollection / CollectionAmount 依 COD 動態帶入
      IsCollection: isCOD ? 'Y' : 'N',
      CollectionAmount: isCOD ? amount.toString() : '0',
      GoodsName: order.items
        .map((i) => i.productName)
        .join('#')
        .slice(0, 25) || '商品一批',
      SenderName: SENDER_NAME,
      SenderCellPhone: SENDER_PHONE,
      ReceiverName: receiverName,
      ReceiverCellPhone: receiverCellular,
      ReceiverStoreID: storeId,
      ServerReplyURL: `${API_URL}/api/orders/logistics-webhook`,
    };

    // 綠界物流 API 使用 MD5 CheckMacValue，不能沿用金流 AIO 的 SHA256。
    params['CheckMacValue'] = generateLogisticsCheckMacValue(params, HASH_KEY, HASH_IV);

    // ─── 呼叫綠界物流 Create API ───
    let responseText = '';
    try {
      const res = await fetch(LOGISTICS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params).toString(),
      });
      responseText = await res.text();
    } catch (err) {
      console.error('[LogisticsService] 呼叫綠界物流 API 失敗:', err);
      throw new AppError(502, '無法連線綠界物流系統，請稍後再試', 'LOGISTICS_GATEWAY_ERROR');
    }

    const parsed = parseLogisticsResponse(responseText);
    if (!parsed.ok) {
      console.error(`[LogisticsService] 綠界物流建立失敗（訂單 ${order.orderNumber}）：${parsed.message}`);
      throw new AppError(400, `綠界物流建立失敗：${parsed.message}`, 'LOGISTICS_CREATE_FAILED');
    }

    // 綠界回傳欄位：AllPayLogisticsID（寄件編號）、CVSPaymentNo、CVSValidationNo（7-11 專有）
    const trackingNumber =
      parsed.data['AllPayLogisticsID'] || parsed.data['CVSPaymentNo'] || merchantTradeNo;
    const cvsPaymentNo = parsed.data['CVSPaymentNo'] || null;
    const cvsValidationNo = parsed.data['CVSValidationNo'] || null;

    // ─── 寫入物流代碼並更新狀態為 SHIPPED ───
    const statusLogData =
      order.status !== 'SHIPPED'
        ? {
            orderId: order.id,
            fromStatus: order.status,
            toStatus: 'SHIPPED',
            actorType: 'ADMIN',
            actorId: actorId ?? null,
            reason: 'ADMIN_C2C_CREATE_SHIPMENT',
            metadata: {
              logisticsMerchantTradeNo: merchantTradeNo,
              shippingTrackingNumber: trackingNumber,
              shippingPaymentNo: cvsPaymentNo,
              shippingValidationNo: cvsValidationNo,
            } satisfies Prisma.InputJsonObject,
          }
        : null;

    const updated = await prisma.$transaction(async (tx) => {
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: {
          shippingTrackingNumber: trackingNumber,
          shippingPaymentNo: cvsPaymentNo,
          shippingValidationNo: cvsValidationNo,
          // 與既有「物流單號」欄位同步，方便後台沿用顯示
          trackingNumber: order.trackingNumber || trackingNumber,
          status: 'SHIPPED',
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          shippingTrackingNumber: true,
          shippingPaymentNo: true,
          shippingValidationNo: true,
        },
      });

      if (statusLogData) {
        await tx.orderStatusLog.create({ data: statusLogData });
      }

      return updatedOrder;
    });

    return updated;
  }
}
