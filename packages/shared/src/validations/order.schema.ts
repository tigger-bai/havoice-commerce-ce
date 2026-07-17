// packages/shared/src/validations/order.schema.ts (路徑依您的專案而定)
import { z } from 'zod';

export const CreateOrderSchema = z.object({
  shippingAddress: z.string().min(5, '請提供完整的收件實體地址').max(200, '地址長度超出限制'),
  billingAddress: z.string().max(200).optional(),
  paymentMethod: z.enum(['CREDIT_CARD', 'BANK_TRANSFER', 'CASH_ON_DELIVERY'], {
    required_error: '請選擇有效的付款方式',
  }),
  notes: z.string().max(500, '備註請勿超過 500 字').optional(),
  
  // 結帳品項陣列驗證
  items: z.array(
    z.object({
      productId: z.string().uuid('無效的商品 ID 格式'),
      quantity: z.number().int().positive('購買數量必須大於 0').max(50, '單一商品單筆限購 50 件'),
    })
  ).min(1, '購物車中至少需要有一項商品才能結帳'),
});

// 匯出 TypeScript 型別供 Service 使用
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;