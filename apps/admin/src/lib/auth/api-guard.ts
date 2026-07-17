import { getServerSession } from 'next-auth';

import { authOptions } from './auth-options';

/**
 * API Route 端的身分與權限驗證 helper（RBAC）
 *
 * 角色階層（由高至低）：
 *   SUPER_ADMIN > ADMIN > EDITOR > VENDOR > USER
 *
 * 設計決策：
 * - 所有後台 API Route Handler 在執行業務邏輯前，必須先呼叫對應守衛
 * - requireAdminSession：允許可進入後台的管理角色（SUPER_ADMIN / ADMIN / EDITOR）
 * - requireSuperAdminSession：僅限 SUPER_ADMIN（系統帳號管理等高權限操作）
 * - requireRole：可指定允許的角色集合，供進階場景使用
 * - 回傳判別聯集 (discriminated union)，呼叫端可依 ok 欄位決定是否提前回傳錯誤
 * - 絕不在此處拋例外，改以結構化結果回傳，方便 Route Handler 統一處理
 */

export type AdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'EDITOR' | 'VENDOR' | 'USER';

export type AdminSessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  role: string;
  status?: string;
};

export type GuardResult =
  | { ok: true; user: AdminSessionUser }
  | { ok: false; status: 401 | 403; code: string; message: string };

// 可進入後台的管理角色（不含 VENDOR / USER）
export const ADMIN_PANEL_ROLES: AdminRole[] = ['SUPER_ADMIN', 'ADMIN', 'EDITOR'];

// 商品 / 訂單模組可用角色（多供應商：額外允許 VENDOR。EDITOR 為內容編輯角色，不參與電商管理）
export const PRODUCT_MODULE_ROLES: AdminRole[] = ['SUPER_ADMIN', 'ADMIN', 'VENDOR'];

/**
 * 通用角色守衛：先驗證登入與停權狀態，再檢查角色是否在 allowedRoles 內
 */
export async function requireRole(allowedRoles: AdminRole[]): Promise<GuardResult> {
  const session = await getServerSession(authOptions);

  // 未登入
  if (!session || !session.user) {
    return {
      ok: false,
      status: 401,
      code: 'UNAUTHENTICATED',
      message: '請先登入後台',
    };
  }

  const user = session.user as AdminSessionUser;

  // 帳號停權
  if (user.status === 'SUSPENDED') {
    return {
      ok: false,
      status: 403,
      code: 'ACCOUNT_SUSPENDED',
      message: '此帳號已被停權',
    };
  }

  // 角色不符
  if (!user.role || !allowedRoles.includes(user.role as AdminRole)) {
    return {
      ok: false,
      status: 403,
      code: 'FORBIDDEN',
      message: '此帳號沒有執行此操作的權限',
    };
  }

  return { ok: true, user };
}

/**
 * 後台管理權限守衛：允許 SUPER_ADMIN / ADMIN / EDITOR
 */
export async function requireAdminSession(): Promise<GuardResult> {
  const result = await requireRole(ADMIN_PANEL_ROLES);
  if (!result.ok && result.code === 'FORBIDDEN') {
    return { ...result, message: '此帳號沒有後台管理權限' };
  }
  return result;
}

/**
 * 商品 / 訂單模組守衛：允許 SUPER_ADMIN / ADMIN / VENDOR
 * - VENDOR 可進入，但在各 Route Handler 內需依 req.user.id 進行租戶隔離（僅能操作自己的商品/訂單）
 * - SUPER_ADMIN / ADMIN 可見全站資料
 */
export async function requireProductModuleSession(): Promise<GuardResult> {
  const result = await requireRole(PRODUCT_MODULE_ROLES);
  if (!result.ok && result.code === 'FORBIDDEN') {
    return { ...result, message: '此帳號沒有商品/訂單管理權限' };
  }
  return result;
}

/**
 * 最高權限守衛：僅限 SUPER_ADMIN
 * - 供系統帳號管理 (/system-users) 等高敏感操作使用
 */
export async function requireSuperAdminSession(): Promise<GuardResult> {
  const result = await requireRole(['SUPER_ADMIN']);
  if (!result.ok && result.code === 'FORBIDDEN') {
    return { ...result, message: '此操作僅限最高權限管理員 (SUPER_ADMIN)' };
  }
  return result;
}
