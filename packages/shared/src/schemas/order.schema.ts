// packages/shared/src/schemas/order.schema.ts
import { z } from 'zod';

export const OrderItemInputSchema = z.object({
  productId: z.string().uuid('商品 ID 格式不正確'),
  quantity: z
    .number()
    .int('數量必須為整數')
    .min(1, '數量至少為 1')
    .max(99, '單一商品數量不可超過 99'),
});

export type OrderItemInputDTO = z.infer<typeof OrderItemInputSchema>;

export const ShippingMethodEnum = z.enum([
  'STANDARD',   // 標準配送
  'EXPRESS',    // 快速配送
  'STORE',      // 超商取貨
]);

export type ShippingMethod = z.infer<typeof ShippingMethodEnum>;

export const PaymentMethodEnum = z.enum([
  'CREDIT_CARD',  // 信用卡
  'ATM',          // ATM 轉帳
  'COD',          // 貨到付款
  'POST_OFFICE_COD', // 郵局貨到付款
]);

export type PaymentMethod = z.infer<typeof PaymentMethodEnum>;

export const CreateOrderSchema = z
  .object({
    recipientName: z
      .string()
      .min(2, '收件人姓名至少 2 個字')
      .max(50, '收件人姓名不可超過 50 個字')
      .trim(),
    recipientPhone: z
      .string()
      .regex(/^09\d{8}$/, '請輸入有效的台灣手機號碼（09 開頭共 10 碼）'),
    recipientEmail: z
      .string()
      .email('請輸入有效的電子郵件地址')
      .toLowerCase()
      .optional(),
    shippingAddress: z
      .string()
      .min(6, '請填寫完整的收件地址或選擇取貨門市')
      .max(200, '地址不可超過 200 個字')
      .trim(),
    shippingMethod: ShippingMethodEnum,
    paymentMethod: PaymentMethodEnum,
    note: z
      .string()
      .max(500, '備註不可超過 500 個字')
      .trim()
      .optional()
      .default(''),

    recipientCity: z.string().max(20).trim().optional(),
    recipientDistrict: z.string().max(20).trim().optional(),
    recipientPostalCode: z
      .string()
      .regex(/^\d{3,6}$/, '郵遞區號格式不正確')
      .optional(),
    recipientDetailAddress: z.string().max(160).trim().optional(),

    cvsStoreId: z.string().max(20).trim().optional(),
    cvsStoreName: z.string().max(80).trim().optional(),
    cvsAddress: z.string().max(200).trim().optional(),
    
    // 🟢 正式加入超商品牌代號
    cvsSubType: z.string().optional(),

    // 🟢 語意優化：改為嚴謹的系統級防護提示
    items: z
      .array(OrderItemInputSchema)
      .min(1, '訂單內至少需包含一項商品')
      .max(50, '單筆訂單最多 50 項商品'),
  })
  .superRefine((data, ctx) => {
    const productIds = data.items.map((item) => item.productId);
    if (new Set(productIds).size !== productIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: '訂單中不可包含重複的商品',
        path: ['items'],
      });
    }

    if (data.shippingMethod === 'STORE') {
      if (!data.cvsStoreId || !data.cvsStoreName) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '請先選擇取貨門市',
          path: ['cvsStoreName'],
        });
      }
      if (data.paymentMethod === 'CREDIT_CARD') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '超商取貨僅支援貨到付款或 ATM 轉帳',
          path: ['paymentMethod'],
        });
      }
    } else {
      if (!data.shippingAddress || data.shippingAddress.trim().length < 10) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: '請填寫完整的收件地址（含縣市、鄉鎮市區與詳細地址）',
          path: ['shippingAddress'],
        });
      }
    }
  });

export type CreateOrderDTO = z.infer<typeof CreateOrderSchema>;

export const OrderQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'CONFIRMED', 'SHIPPED', 'DELIVERED', 'CANCELLED']).optional(),
  userId: z.string().uuid().optional(),
});

export type OrderQueryDTO = z.infer<typeof OrderQuerySchema>;
