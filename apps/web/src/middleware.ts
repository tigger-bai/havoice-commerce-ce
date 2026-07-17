// apps/web/src/middleware.ts
import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/auth/login", // 告訴 Next.js 未登入時要把人踢去哪裡
  },
});

// 設定要保護的路由路徑
export const config = {
  matcher: [
    "/checkout", // 保護結帳頁
    "/checkout/((?!success(?:/|$)).*)", // 綠界 OrderResultURL /checkout/success 必須公開
    "/member/:path*"    // 保護會員中心頁
  ],
};
