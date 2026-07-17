> **封存聲明：**此文件為歷史開發紀錄，不代表目前最新實作。最新資訊請以根目錄 README、目前程式碼與更新後文件為準。

# 後台商品與庫存管理模組（交付說明）

本文件說明「快樂之音」B2B 營運後台（`apps/admin`）最後一個模組——**商品與庫存管理（含行內快速編輯）**的設計與實作，並記錄本次同步完成的型別與建置修復。

## 一、模組總覽

商品與庫存管理是營運後台「營運管理」導覽群組下的第三個核心模組，與既有的「營運總覽」「訂單管理」共用同一套設計語言與基礎元件。本模組強調**列表內快速管理**：營運人員無需進入子頁，即可在表格列中直接調整庫存數量與上下架狀態，符合主流 SaaS 後台（Shopify Admin、Linear、Notion）的高效操作習慣。

| 項目 | 內容 |
| --- | --- |
| 頁面路由 | `/products`（`apps/admin/src/app/(protected)/products/page.tsx`） |
| 列表 API | `GET /api/products`（分頁、狀態篩選、關鍵字搜尋） |
| 行內編輯 API | `PATCH /api/products/[id]`（更新 `stock` 與 `status`） |
| 行內編輯元件 | `components/products/InlineQuickEdit.tsx`（`StockInlineEdit`、`StatusInlineEdit`） |
| 權限 | 所有 API 端點皆經 `requireAdminSession` 驗證，僅允許 `ADMIN` / `EDITOR` |

## 二、API 設計

### GET /api/products

支援分頁（`page`、`limit`，上下限夾擠）、狀態篩選（`status`，僅接受合法 `PublishStatus`）與關鍵字搜尋（`keyword`，比對 `name` / `sku` / `slug`）。僅回傳未軟刪除（`deletedAt = null`）的商品。所有金額欄位（`price`、`compareAtPrice`）一律經 `toNumber` 序列化，避免前端接收到 Prisma `Decimal` 物件而崩潰。

回應格式統一為 `{ success: true, data: { items, pagination } }`。

### PATCH /api/products/[id]

行內快速編輯端點，採**欄位白名單**（僅 `stock` 與 `status`）以杜絕大量賦值（mass assignment）漏洞。庫存以 `toInt` 安全轉換並夾擠為非負整數；狀態必須為合法 enum，否則回 `400 INVALID_STATUS`。更新前先確認商品存在且未軟刪除，且至少需提供一個可更新欄位。

## 三、前端設計

### 行內快速編輯（Inline Quick Edit）

`StockInlineEdit` 與 `StatusInlineEdit` 各自持有**獨立的 `submitting` 狀態**，從根本上避免不同列之間的競態條件。庫存欄位在 `blur` 或按 `Enter` 時觸發 `PATCH`，若值未變更則不發送請求；狀態下拉選擇後即時生效。所有操作採**樂觀更新**：API 成功後僅更新該列對應欄位（`patchRow`），無需整頁重抓；失敗時還原為原值並以 Toast 提示，畫面不崩潰。

### 低庫存警示

低庫存閾值為 `stock < 10`。庫存輸入框於低庫存時以紅色強調並顯示「低庫存」標記，頁首亦提供當頁低庫存數量的警示橫幅，方便營運人員快速補貨。

### 防禦性程式設計

所有數值經 `safeNumber` 轉換，封面圖載入失敗時隱藏圖片並退回佔位圖示，API 錯誤統一以 `ErrorAlert` 呈現並提供「重新嘗試」。

## 四、本次同步完成的型別與建置修復

為確保整個 `apps/admin` 套件可通過 TypeScript 型別檢查並順利通過 `next build` 生產建置，本次一併修復了數個**先前階段遺留**的問題：

| 問題 | 修復方式 |
| --- | --- |
| 後台缺少 NextAuth 型別擴充，導致 `session.user.id/role/status` 型別錯誤 | 新增 `src/types/next-auth.d.ts`，擴充 `Session` / `User` / `JWT` |
| Route Handler 從 `@prisma/client` 直接匯入 `Prisma` 型別，於 admin 目錄無法解析 | 改由 monorepo 資料層出口 `@havoice/database` 匯入（該套件已 `export * from '@prisma/client'`） |
| `api-client.ts` 中 `...(body && {...})` 的 spread 型別錯誤 | 改為三元運算 `...(body ? {...} : {})` |
| `/auth/login` 使用 `useSearchParams()` 未包 Suspense，導致 CSR bailout 建置失敗 | 拆出 `AdminLoginContent` 並以 `<Suspense>` 包裹 |

修復後：

- `apps/admin` 之 `tsc --noEmit`：**通過（exit 0）**
- `apps/admin` 之 `next build`：**Compiled successfully**，13 個路由全數產出（含 `/products`、`/api/products`、`/api/products/[id]`）
- `packages/shared` 之 `tsc --noEmit`：通過

> 注意：`apps/web` 仍存在數個先前階段遺留的型別問題（`user/orders` 路由引用 schema 不存在的欄位、`checkout` response 型別）。依使用者明確要求「不可修改 `apps/web` 任何程式碼」，本次未予更動。

## 五、設計取捨

舊版商品模組（`products/new`、`products/[id]` 編輯子頁，依賴 `useProducts` hook 與舊 UI barrel，並透過 Express 後端的 `apiClient`）已移除，改為與新營運後台一致的**列表內快速管理**模式。新商品頁走後台**同源 Next.js Route Handler**（`/api/products`），與 Express 端點（`apps/api`，由文章導購設定器使用）彼此隔離、互不影響。
