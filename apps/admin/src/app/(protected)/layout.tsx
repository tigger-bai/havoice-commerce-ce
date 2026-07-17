import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';

import { authOptions } from '@/lib/auth/auth-options';
import { AdminShell } from '@/components/layout/AdminShell';
import { AuthGuard } from '@/components/auth/AuthGuard';

/**
 * Protected Layout - 受保護的後台頁面佈局（雙層防護）
 *
 * 設計決策：
 * - 第一道防線（本檔，Server Component）：getServerSession 解析 NextAuth JWT，
 *   未登入或角色非 ADMIN/EDITOR 直接在伺服器端 redirect，畫面永不洩漏。
 * - 第二道防線（AuthGuard，Client Component）：處理 client 端 session 變化
 *   （如登出、token 過期）即時重導，並提供載入動畫。
 * - middleware.ts 仍在 Edge Runtime 層級提供最外層攔截。
 */
const ALLOWED_ROLES = ['SUPER_ADMIN', 'ADMIN', 'EDITOR', 'VENDOR'];

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  // 未登入 → 導向登入頁
  if (!session || !session.user) {
    redirect('/auth/login');
  }

  const role = (session.user as { role?: string }).role;
  const status = (session.user as { status?: string }).status;

  // 帳號停權 → 導向登入頁
  if (status === 'SUSPENDED') {
    redirect('/auth/login?error=AccountSuspended');
  }

  // 角色不符 → 導向 403 頁
  if (!role || !ALLOWED_ROLES.includes(role)) {
    redirect('/auth/forbidden');
  }

  return (
    <AuthGuard allowedRoles={ALLOWED_ROLES}>
      <AdminShell>{children}</AdminShell>
    </AuthGuard>
  );
}
