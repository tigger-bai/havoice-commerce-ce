import type { Metadata } from 'next';

import { AuthProvider } from '@/lib/auth/AuthProvider';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { CartDrawer } from '@/components/cart/CartDrawer';
import './globals.css';

export const metadata: Metadata = {
  title: '快樂之音 Joyful Voice — 用音樂與文字點亮生活',
  description:
    '快樂之音是結合優質內容與精選商品的生活風格平台，提供音樂、閱讀與生活美學的全方位體驗。',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant">
      <body className="flex min-h-screen flex-col">
        <AuthProvider>
          <Navbar />
          <main className="flex-1">{children}</main>
          <Footer />
          <CartDrawer />
        </AuthProvider>
      </body>
    </html>
  );
}
