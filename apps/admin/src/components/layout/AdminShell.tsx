'use client';

import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

/**
 * AdminShell - 後台管理的主佈局殼層
 *
 * 設計決策：
 * - 使用 Client Component 管理側邊欄的開關狀態
 * - 響應式設計：行動裝置使用抽屜式側邊欄，桌面端固定顯示
 * - children 為 Server Component 的頁面內容
 */
export function AdminShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* 側邊欄 */}
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* 主內容區域 */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* 頂部列 */}
        <Header onMenuToggle={() => setSidebarOpen(true)} />

        {/* 頁面內容 */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
