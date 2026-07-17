import type { Metadata } from 'next';

import { AuthProvider } from '@/lib/auth/AuthProvider';
import './globals.css';

export const metadata: Metadata = {
  title: '快樂之音 - 管理後台',
  description: '快樂之音 (Joyful Voice) 企業級 CMS 與電子商務管理平台',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
