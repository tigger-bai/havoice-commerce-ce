> **封存聲明：**此文件為歷史開發紀錄，不代表目前最新實作。最新資訊請以根目錄 README、目前程式碼與更新後文件為準。

# 快樂之音平台 — RBAC 權限階層 與 全站動態頁面編輯器 升級交付說明

本次為一次**原子的架構升級**，橫跨 `packages/database`、`packages/shared`、`apps/api`、`apps/admin`、`apps/web` 五個工作區。前後端型別已對齊，五工作區 `tsc --noEmit` 全數 0 錯誤，且 `apps/admin`、`apps/web` 皆能通過 Next.js production build。

---

## 一、交付前驗證結果

| 工作區 | 驗證指令 | 結果 |
| --- | --- | --- |
| packages/database | `tsc --noEmit` | ✅ Pass |
| packages/shared | `tsc --noEmit` | ✅ Pass |
| apps/api | `tsc --noEmit` | ✅ Pass |
| apps/admin | `tsc --noEmit` + `next build` | ✅ Pass |
| apps/web | `tsc --noEmit` + `next build` | ✅ Pass |
| packages/database | `prisma validate` | ✅ Schema is valid |

> 說明：`apps/web` build 日誌出現 `[getActiveLayoutSections] 載入行銷版位失敗：500`，屬**預期行為**。建置階段沙箱未啟動後端 API，ISR 預取走防禦性 `catch` fallback（回傳空陣列），頁面仍正常產生，不影響交付。

---

## 二、Phase 1：資料庫 Schema 擴充與遷移

**檔案：`packages/database/schema.prisma`**

- `Role` enum 擴充為：`USER, SUPER_ADMIN, ADMIN, EDITOR, VENDOR`
- `LayoutSection` 新增 `pageRoute String @default("/shop")`，既有資料自動向後相容
- 新增複合索引 `@@index([pageRoute, sortOrder])` 加速依頁面查詢與排序

**遷移套用（擇一）：**

```bash
# 方式 A：開發環境（建議，可使用 shadow database）
cd packages/database
npx prisma migrate dev --schema=./schema.prisma --name rbac_and_pageroute

# 方式 B：直接套用手寫 SQL（雲端託管 DB 無 shadow 權限時）
# 檔案：packages/database/prisma/migrations/manual_rbac_pageroute.sql

# 重新生成 Prisma Client（兩種方式後都需要）
pnpm --filter @havoice/database db:generate
```

**將你的管理員帳號升級為 SUPER_ADMIN：**

```bash
# 必須明確指定帳號（兩種傳參皆可；以下僅為範例）
PROMOTE_EMAIL=admin@example.com pnpm --filter @havoice/database promote:super-admin
pnpm --filter @havoice/database promote:super-admin -- admin@example.com
```

> 腳本 `prisma/promote-super-admin.ts` 為**冪等**設計：僅更新單一帳號 role，不重建任何資料；帳號不存在時以非零結束碼結束。

---

## 三、Phase 2：RBAC 後台權限與模組隔離

**API 守衛（`apps/api/src/middlewares/auth.middleware.ts`）**

- 新增 `requireSuperAdmin = [authenticateJWT, requireRole('SUPER_ADMIN')]`
- `requireAdmin` 調整為涵蓋 `SUPER_ADMIN, ADMIN, EDITOR`，形成階層 `SUPER_ADMIN ≥ ADMIN/EDITOR`

**系統帳號管理（僅 SUPER_ADMIN）**

- API：`apps/admin/src/app/api/system-users/route.ts`、`.../[id]/route.ts`，皆以 `requireSuperAdminSession` 守衛
- 頁面：`/system-users`（列表）、`/system-users/new`（新增）、`/system-users/[id]`（編輯）
- 僅管理 `ADMIN / EDITOR / VENDOR`，提供「角色下拉選單」；不可在此建立或降改 `SUPER_ADMIN`

**會員管理淨化（`/users`）**

- API 僅撈 `role === 'USER'` 的前台顧客（`where: { deletedAt: null, role: 'USER' }`）
- 移除角色切換功能，純供顧客資料檢視；新增會員固定為 `USER`

**側邊欄（`Sidebar.tsx`）**

- 「行銷版位」更名為「**頁面設計**」
- 「**系統帳號管理**」導覽僅 `SUPER_ADMIN` 可見（依 session 角色過濾）

---

## 四、Phase 3：頁面編輯器 API（pageRoute）

- `GET /api/layouts?pageRoute=` 依路由過濾，僅回傳該頁面區塊；回傳含 `pageRoute`
- `PATCH /api/layouts/reorder` 加入 `pageRoute` 範圍驗證：所有排序 ID 必須屬於同一 `pageRoute`
- `apps/api` 公開 `GET /api/layouts` 亦支援 `?pageRoute=` 過濾
- 白名單以 `packages/shared` 為單一真實來源：`PAGE_ROUTES = ['/', '/shop']`

---

## 五、Phase 4：後台頁面編輯器兩層動線

- **第一層 `/layouts`**：頁面列表（首頁 `/`、商城頁 `/shop`），每張卡片顯示版位數與「設計此頁」按鈕
- **第二層 `/layouts/editor/[route]`**：特定 `pageRoute` 的拖曳排序編輯器（`home → '/'`、`shop → '/shop'`），沿用原拖曳邏輯，reorder 帶 `pageRoute`
- 新增版位 `/layouts/new?pageRoute=...` **自動綁定當前 pageRoute**；編輯版位麵包屑回到對應編輯器

---

## 六、Phase 5：前台動態渲染與新積木

- 首頁 `apps/web/src/app/page.tsx` 請求 `pageRoute='/'`；商城頁 `apps/web/src/app/shop/page.tsx` 請求 `pageRoute='/shop'`，交由 `SectionRenderer` 渲染
- 新增三種積木（已於 `SectionRenderer` 註冊、`apps/web` 型別擴充）：
  - **ICON_NAVIGATION**：一排多格圓形分類按鈕（`IconNavigation.tsx`）
  - **IMAGE_WITH_TEXT**：左圖右文／右圖左文交錯（`ImageWithText.tsx`）
  - **PROMO_BANNER**：單張活動橫幅（`PromoBanner.tsx`）
- 清理：移除未再引用的舊派發器 `LayoutSections.tsx`

---

## 七、驗收路徑

1. 套用遷移並 `db:generate`
2. 執行 `promote:super-admin` 將你的帳號升級為 SUPER_ADMIN
3. 以 SUPER_ADMIN 登入後台：
   - 左欄可見「系統帳號管理」與「頁面設計」
   - 於「頁面設計」分別進入「首頁」與「商城頁」獨立排版
   - 於「系統帳號管理」以角色下拉選單建立 / 編輯 ADMIN / EDITOR / VENDOR
   - 「會員管理」僅顯示一般顧客且無角色切換
4. 前台首頁與商城頁各自呈現對應 `pageRoute` 的動態區塊
