import { z } from 'zod';

/**
 * 帳號管理 Zod Schema（前後端共用驗證契約）
 *
 * RBAC 架構升級後，帳號被劃分為兩個獨立管理域：
 *  1. 會員管理 (/users)        → 僅一般消費者，role 固定為 USER
 *  2. 系統帳號管理 (/system-users) → 內部人員，role ∈ { ADMIN, EDITOR, VENDOR }
 *
 * 設計決策：
 * - 嚴格對齊 schema.prisma 的 Role enum：USER / SUPER_ADMIN / ADMIN / EDITOR / VENDOR
 * - 會員管理不得在此建立或升級為任何管理角色，避免越權
 * - 系統帳號管理僅供 SUPER_ADMIN 操作；SUPER_ADMIN 本身不可在此被建立/降級（保護最高權限）
 * - status 於 UI 僅開放 ACTIVE / SUSPENDED；DELETED 保留給軟刪除流程
 * - 密碼：新增必填（最少 8 碼），編輯選填（留空表示不更新）
 */

// 一般會員角色（會員管理域）
export const MEMBER_ROLES = ['USER'] as const;
// 系統帳號可指派角色（系統帳號管理域，不含 SUPER_ADMIN / USER）
export const SYSTEM_ROLES = ['ADMIN', 'EDITOR', 'VENDOR'] as const;
// 全部角色（供顯示用）
export const ALL_ROLES = ['USER', 'SUPER_ADMIN', 'ADMIN', 'EDITOR', 'VENDOR'] as const;

// UI 可選狀態（不含 DELETED，DELETED 透過軟刪除流程設定）
export const USER_STATUSES = ['ACTIVE', 'SUSPENDED'] as const;

export const MemberRoleSchema = z.enum(MEMBER_ROLES);
export const SystemRoleSchema = z.enum(SYSTEM_ROLES);
export const UserStatusSchema = z.enum(USER_STATUSES);

const nameSchema = z
  .string({ required_error: '請輸入姓名' })
  .trim()
  .min(1, '請輸入姓名')
  .max(100, '姓名長度不可超過 100 字');

const emailSchema = z
  .string({ required_error: '請輸入 Email' })
  .trim()
  .min(1, '請輸入 Email')
  .email('Email 格式不正確')
  .max(255, 'Email 長度不可超過 255 字');

const passwordSchema = z
  .string()
  .min(8, '密碼至少需 8 個字元')
  .max(72, '密碼長度不可超過 72 個字元');

// 頭像：選填，允許有效 URL 或空字串（空字串代表未設定）
const imageSchema = z
  .union([
    z.string().trim().url('頭像必須是有效的圖片網址').max(2048, '網址長度過長'),
    z.literal(''),
  ])
  .optional();

const optionalTextSchema = (max: number, label: string) =>
  z
    .preprocess((value) => {
      if (typeof value !== 'string') return value;
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }, z.string().max(max, `${label}長度不可超過 ${max} 字`).optional());

const phoneSchema = optionalTextSchema(30, '電話');
const addressSchema = optionalTextSchema(500, '地址');
const remarkSchema = optionalTextSchema(1000, '備註');

/* -------------------------------------------------------------------------- */
/*  會員管理（/users）— role 固定 USER                                         */
/* -------------------------------------------------------------------------- */

/** 新增會員：密碼必填，role 鎖定 USER */
export const CreateUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: MemberRoleSchema.default('USER'),
  status: UserStatusSchema.default('ACTIVE'),
  image: imageSchema,
  phone: phoneSchema,
  address: addressSchema,
  remark: remarkSchema,
});

/** 編輯會員（完整更新）：密碼選填，role 鎖定 USER */
export const UpdateUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: z.union([passwordSchema, z.literal(''), z.undefined()]).optional(),
  role: MemberRoleSchema.default('USER'),
  status: UserStatusSchema,
  image: imageSchema,
  phone: phoneSchema,
  address: addressSchema,
  remark: remarkSchema,
});

/** 會員行內快速編輯：僅 status（會員不應在此被改變角色） */
export const InlineUserPatchSchema = z
  .object({
    status: UserStatusSchema.optional(),
  })
  .refine((d) => d.status !== undefined, {
    message: '請提供 status 欄位',
  });

/* -------------------------------------------------------------------------- */
/*  系統帳號管理（/system-users）— role ∈ {ADMIN, EDITOR, VENDOR}              */
/* -------------------------------------------------------------------------- */

/** 新增系統帳號：密碼必填，role 必選（管理角色） */
export const CreateSystemUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: SystemRoleSchema,
  status: UserStatusSchema.default('ACTIVE'),
  image: imageSchema,
});

/** 編輯系統帳號（完整更新）：密碼選填 */
export const UpdateSystemUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: z.union([passwordSchema, z.literal(''), z.undefined()]).optional(),
  role: SystemRoleSchema,
  status: UserStatusSchema,
  image: imageSchema,
});

/** 系統帳號行內快速編輯：role 與 status，至少一個 */
export const InlineSystemUserPatchSchema = z
  .object({
    role: SystemRoleSchema.optional(),
    status: UserStatusSchema.optional(),
  })
  .refine((d) => d.role !== undefined || d.status !== undefined, {
    message: '請提供 role 或 status 至少一個欄位',
  });

// 表單值型別（使用 input 型別，含 default 的欄位於輸入時為 optional）
export type CreateUserInput = z.input<typeof CreateUserSchema>;
export type UpdateUserInput = z.input<typeof UpdateUserSchema>;
export type CreateSystemUserInput = z.input<typeof CreateSystemUserSchema>;
export type UpdateSystemUserInput = z.input<typeof UpdateSystemUserSchema>;
