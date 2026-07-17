import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════
// 註冊驗證 Schema
// ═══════════════════════════════════════════════════════════════

export const RegisterSchema = z
  .object({
    email: z
      .string({ required_error: '電子郵件為必填欄位' })
      .email('請輸入有效的電子郵件地址')
      .max(255, '電子郵件長度不可超過 255 字元')
      .transform((val) => val.toLowerCase().trim()),

    password: z
      .string({ required_error: '密碼為必填欄位' })
      .min(8, '密碼長度至少需要 8 個字元')
      .max(72, '密碼長度不可超過 72 字元（bcrypt 限制）')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        '密碼必須包含至少一個大寫字母、一個小寫字母與一個數字'
      ),

    confirmPassword: z.string({ required_error: '確認密碼為必填欄位' }),

    name: z
      .string()
      .min(2, '姓名至少需要 2 個字')
      .max(50, '姓名不可超過 50 字')
      .optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: '兩次輸入的密碼不一致',
    path: ['confirmPassword'],
  });

export type RegisterDTO = z.infer<typeof RegisterSchema>;

// ═══════════════════════════════════════════════════════════════
// 登入驗證 Schema
// ═══════════════════════════════════════════════════════════════

export const LoginSchema = z.object({
  email: z
    .string({ required_error: '電子郵件為必填欄位' })
    .email('請輸入有效的電子郵件地址')
    .transform((val) => val.toLowerCase().trim()),

  password: z
    .string({ required_error: '密碼為必填欄位' })
    .min(1, '請輸入密碼'),
});

export type LoginDTO = z.infer<typeof LoginSchema>;

// ═══════════════════════════════════════════════════════════════
// Auth 回應型別（供前端消費）
// ═══════════════════════════════════════════════════════════════

export interface AuthTokenPayload {
  userId: string;
  email: string;
  role: string;
  name: string | null;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    name: string | null;
    role: string;
  };
  token: string;
  expiresIn: string;
}
