import { z } from 'zod';

const nullableText = (max: number, label: string) =>
  z.preprocess(
    (value) => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    },
    z.string().max(max, `${label}長度不可超過 ${max} 字`).nullable().optional(),
  );

const emailSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim().toLowerCase();
    return trimmed.length > 0 ? trimmed : null;
  },
  z.string().email('Email 格式不正確').max(120).nullable().optional(),
);

const postalCodeSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  },
  z.string().regex(/^\d{3,6}$/, '郵遞區號格式不正確').nullable().optional(),
);

export const CustomerCreateSchema = z.object({
  name: z.string().trim().min(1, '請輸入客戶姓名').max(80, '客戶姓名不可超過 80 字'),
  phone: nullableText(30, '電話'),
  email: emailSchema,
  lineId: nullableText(80, 'LINE ID'),
  facebookName: nullableText(120, 'Facebook 名稱'),
  postalCode: postalCodeSchema,
  city: nullableText(20, '縣市'),
  district: nullableText(20, '行政區'),
  address: nullableText(500, '地址'),
  remark: nullableText(1000, '備註'),
  source: nullableText(50, '來源'),
});

export const CustomerUpdateSchema = z
  .object({
    name: z.string().trim().min(1, '請輸入客戶姓名').max(80, '客戶姓名不可超過 80 字').optional(),
    phone: nullableText(30, '電話'),
    email: emailSchema,
    lineId: nullableText(80, 'LINE ID'),
    facebookName: nullableText(120, 'Facebook 名稱'),
    postalCode: postalCodeSchema,
    city: nullableText(20, '縣市'),
    district: nullableText(20, '行政區'),
    address: nullableText(500, '地址'),
    remark: nullableText(1000, '備註'),
    source: nullableText(50, '來源'),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: '請提供至少一個要更新的欄位',
  });

export type CustomerCreateInput = z.input<typeof CustomerCreateSchema>;
export type CustomerUpdateInput = z.input<typeof CustomerUpdateSchema>;
