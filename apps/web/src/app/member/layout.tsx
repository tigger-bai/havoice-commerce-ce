import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/auth-options';
import { MemberSidebar } from './MemberSidebar';

/**
 * 會員中心佈局 (Server Component)
 *
 * 設計決策：
 * - 在 Server Component 層級檢查 Session，未登入直接 redirect
 * - 左側子導覽列 + 右側內容區域（桌面版）
 * - 行動版改為頂部 Tab 導覽
 * - 傳遞 user 資訊給子頁面使用
 */
export default async function MemberLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  // 權限控管：未登入強制導回登入頁
  if (!session?.user) {
    redirect('/auth/login?callbackUrl=/member');
  }

  return (
    <div className="container-page py-8 sm:py-12">
      {/* 頁面標題 */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">會員中心</h1>
        <p className="mt-1 text-sm text-gray-500">
          歡迎回來，{session.user.name || '會員'}
        </p>
      </div>

      {/* 主體：左側導覽 + 右側內容 */}
      <div className="flex flex-col gap-8 lg:flex-row">
        {/* 子導覽列 */}
        <aside className="w-full shrink-0 lg:w-64">
          <MemberSidebar
            userName={session.user.name || '會員'}
            userEmail={session.user.email || ''}
            userImage={session.user.image || undefined}
          />
        </aside>

        {/* 內容區域 */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
