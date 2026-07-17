# 快樂之音 (Joyful Voice) — CMS 後台實作與整合指南

> **版本**：v1.0.0  
> **日期**：2026-06-02  
> **技術棧**：Next.js 14+ (App Router) · Tailwind CSS · TypeScript · Zustand · Zod

---

## 一、CMS 後台前端架構設計

「快樂之音」後台管理系統 (`apps/admin`) 採用 **Next.js 14+ App Router** 架構，結合 **Tailwind CSS** 與 **TypeScript**，並透過共用元件、API client 與 shared DTO 組織管理功能。

```
[ Next.js Page ] ──► [ Custom Hooks (useArticles/useProducts) ]
       │                                   │
       ▼                                   ▼
[ Core Forms / Tables ] ───────────► [ API Client (Fetch) ]
       │                                   │
       ▼                                   ▼
[ Reusable UI (DataTable/FormField) ] ◄── [ Backend REST API ]
```

### 1.1 前端專案結構與模組邊界

```
apps/admin/src/
  ├── app/
  │   ├── layout.tsx         # 全域佈局，掛載 AdminShell
  │   ├── page.tsx           # 儀表板首頁，展示數據統計卡片
  │   ├── articles/          # 文章管理路由
  │   │   ├── page.tsx       # 文章列表頁（含分頁與篩選）
  │   │   ├── new/page.tsx   # 新增文章頁面
  │   │   └── [id]/page.tsx  # 編輯文章頁面
  │   └── products/          # 商品管理路由
  │       ├── page.tsx       # 商品列表頁（含低庫存警示）
  │       ├── new/page.tsx   # 新增商品頁面
  │       └── [id]/page.tsx  # 編輯商品頁面
  ├── components/
  │   ├── layout/            # 佈局組件 (Sidebar, Header, AdminShell)
  │   ├── ui/                # 高度抽象的通用 UI 組件 (DataTable, FormField, Pagination)
  │   ├── articles/          # 文章模組專用組件 (ArticleForm, RecommendationSelector)
  │   └── products/          # 商品模組專用組件 (ProductForm)
  ├── hooks/                 # 自定義 API Hooks (useArticles, useProducts)
  ├── lib/                   # 基礎工具庫 (api-client, cn)
  └── types/                 # 僅用於前端消費的資料實體型別定義
```

---

## 二、通用 UI 元件與基礎設施設計

為了避免程式碼冗餘，我們將常見的後台 UI 模式抽象化為高度可複用的組件：

| 組件名稱 | 設計決策與特色 | 程式碼亮點 |
|---------|---------------|-----------|
| **`DataTable<T>`** | 採用 TypeScript 泛型，確保表格欄位與資料型別安全。支援自定義 `render` 函式、載入中骨架屏與空狀態。 | `columns: Column<T>[]` |
| **`Pagination`** | 自動計算頁碼按鈕。最多顯示 5 個頁碼，超過時自動渲染省略號 (`...`)，並包含首末頁導航。 | `getPageNumbers()` 演算法 |
| **`FormField`** | 整合 Label、Input/Textarea/Select 渲染、描述文字與 Zod 錯誤訊息。 | 統一的錯誤邊框與錯誤 icon 提示 |
| **`StatusBadge`** | 集中管理狀態標籤的視覺樣式（草稿、已發佈、已下架、低庫存等）。 | 語義化的顏色映射 (`variantStyles`) |

---

## 三、核心管理模組實作細節

### 3.1 雙欄導購商品設定器 (`RecommendationSelector`)

此組件負責連結內容 (CMS) 與商城 (E-Commerce) 的推薦資料：

*   **左側：可選商品列表**
    *   內建防抖 (Debounce) 搜尋機制（延遲 300ms 觸發 API 請求），避免使用者輸入時產生高頻 API 負載。
    *   自動過濾已被右側勾選的商品，防止重複加入。
*   **右側：已選推薦商品**
    *   支援透過「上移 / 下移」按鈕即時調整 `sortOrder`。
    *   支援手動輸入數字直接修改排序權重。
    *   限制單篇文章最多關聯 20 個商品。
*   **數據同步**：每次調整皆會觸發 `onChange`，將最新的 `productId` 與 `sortOrder` 陣列同步回父表單。

### 3.2 商品管理與低庫存警示

商品管理提供低庫存視覺提示，協助營運人員辨識需要補貨的項目：

1.  **全域警示橫幅**：若當前分頁中存在庫存低於閾值（預設為 10 件）的商品，列表頁頂部會自動彈出紅色警示橫幅，提示營運人員補貨。
2.  **表格高亮**：低庫存商品的數量會標紅顯示，並附帶一個黃色的「低庫存」Badge，提供直觀的視覺反饋。
3.  **表單即時提示**：在商品編輯表單中，當管理員輸入的庫存小於 10 時，輸入框下方會即時顯示紅色的補貨建議。

---

## 四、API 整合與錯誤處理機制

### 4.1 統一 API 客戶端 (`api-client.ts`)

我們封裝了原生的 `fetch`，實作了統一的 `apiClient`：
*   **型別安全**：所有的請求與回應都與 `@havoice/shared` 中的 DTO 及驗證 Schema 深度綁定。
*   **異常轉譯**：當後端回傳 `success: false` 時，客戶端會自動將其包裝為 `ApiClientError`，並解析出內部的錯誤代碼（如 `VALIDATION_ERROR`）與欄位驗證細節（`details`）。

### 4.2 自定義 Hooks 的三態管理

我們為文章與商品封裝了專屬的 Hooks（如 `useArticles`、`useProductMutations`），這些 Hooks 內部自動維護三個核心狀態：
1.  **`data`**：後端回傳的型別安全資料。
2.  **`isLoading`**（或 `isSubmitting`）：控制按鈕的 `disabled` 狀態與 Loading 菊花圖/骨架屏的顯示。
3.  **`error`**：當 API 請求失敗時，捕獲錯誤訊息並傳遞給 UI 渲染 `ErrorAlert`。

### 4.3 雙向驗證流程 (Double Validation)

我們在前端表單提交時，會先使用 `packages/shared` 中的 Zod Schema 進行**前端預驗證**。若驗證失敗，會直接將 Zod 錯誤對應到各個 `FormField` 上，**完全不發送 HTTP 請求**，大幅減輕伺服器的壓力：

```typescript
try {
  const validated = CreateArticleSchema.parse(payload);
  await createArticle(validated); // 驗證通過，發送請求
} catch (err) {
  if (err instanceof ZodError) {
    // 解析 Zod 錯誤並映射到對應的 FormField 上
    setFieldErrors(parseZodErrors(err)); 
  }
}
```

若資料繞過前端進入後端，後端的 Zod 驗證中間件仍會進行攔截；前端 `apiClient` 會依既有錯誤格式呈現伺服器端錯誤。
