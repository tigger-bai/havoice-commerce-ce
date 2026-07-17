# 快樂之音 (Joyful Voice) — 後端 API 實作與整合指南

> **版本**：v1.0.0  
> **日期**：2026-06-02  
> **技術棧**：Next.js 14+ (App Router) · Express · TypeScript · Tailwind CSS · Prisma · MySQL · Zustand · Zod

---

## 一、後端架構設計精要

「快樂之音」平台的後端 API (`apps/api`) 採用分層架構 (Layered Architecture)，以 Routes、Middleware、Controller、Service 與資料存取層區分主要職責。實際邊界仍以目前程式碼為準。

```
[ HTTP Request ] ──► [ Routes ] ──► [ Validation Middleware (Zod) ]
                                                   │
                                                   ▼
[ HTTP Response ] ◄── [ Controller ] ◄── [ Service Layer (Prisma) ]
                             │
                             ▼
                    [ Global Error Handler ]
```

### 1.1 分層架構職責說明

| 階層 | 職責與邊界 | 關鍵技術與設計決策 |
|------|-----------|-------------------|
| **路由層 (Routes)** | 定義 RESTful API 端點與對應的 HTTP 動詞。 | 僅負責路徑分發與掛載相應的中間件，不包含任何業務邏輯。 |
| **驗證層 (Validation)** | 攔截不合規的請求，防止髒資料進入核心業務層。 | 使用 Zod 進行 Schema 驗證，並將驗證通過後的資料（含型別轉換與預設值）重新寫入 `req.body` 或 `req.query`。 |
| **控制器層 (Controllers)** | 處理 HTTP 協議相關細節，包括狀態碼、請求解析、回應組裝。 | 嚴禁直接調用資料庫。所有方法皆使用 `try-catch` 結構，並透過 `next(error)` 將異常傳遞給全域錯誤處理器。 |
| **服務層 (Services)** | 系統的核心大腦，封裝所有的業務邏輯與資料庫操作。 | 透過 `@havoice/database` 的 Prisma 實例與資料庫互動。不依賴 Express 的 `req` 或 `res` 物件，以便進行單元測試。 |
| **全域錯誤處理 (Error Handler)** | 集中管理整個應用程式的異常，提供一致性的錯誤回應格式。 | 區分「可預期業務錯誤」與「不可預期系統錯誤」，在生產環境下自動隱藏敏感的堆疊追蹤 (Stack Trace)。 |

---

## 二、共用型別與驗證 (`packages/shared`)

我們在 `packages/shared` 中實作了高規格的 Zod 驗證 Schema，並自動推導出對應的 TypeScript 型別 (DTOs)。這使得前端與後端能共享同一套「資料契約」，徹底消除了前後端對接時的型別漂移問題。

### 2.1 導購推薦設定驗證 (`SetRecommendationsDTO`)

此驗證除了檢查陣列結構，也透過 Zod 的 `refine` 在記憶體中檢查重複商品 ID，以降低資料庫寫入時發生唯一性約束衝突的機會。

```typescript
export const SetRecommendationsSchema = z.object({
  recommendations: z
    .array(
      z.object({
        productId: z.string().uuid('商品 ID 必須為有效的 UUID'),
        sortOrder: z.number().int('排序權重必須為整數').min(0, '排序權重不可為負數'),
      })
    )
    .max(20, '單篇文章最多關聯 20 個推薦商品')
    .refine(
      (items) => {
        const productIds = items.map((item) => item.productId);
        return new Set(productIds).size === productIds.length;
      },
      { message: '推薦商品不可重複' }
    ),
});
```

---

## 三、核心業務邏輯與技術決策

### 3.1 內容與商城模組：分頁與軟刪除過濾

相關內容與商品服務採用**邏輯刪除 (Soft Delete)**，以 `deletedAt` 欄位保留紀錄；並非所有 model 都保證採用相同策略，應以 schema 與各 service 為準。

*   **過濾機制**：所有 Service 的查詢（如 `ArticleService.findAll` 與 `ProductService.findAll`）皆強制加上 `deletedAt: null` 條件。
*   **分頁一致性**：使用 Prisma 的 `$transaction` 確保 `count`（總筆數）與 `findMany`（分頁資料）在同一資料庫快照下執行，避免因高並發寫入導致分頁元數據不精確。

```typescript
const [total, articles] = await prisma.$transaction([
  prisma.article.count({ where: { deletedAt: null, categoryId } }),
  prisma.article.findMany({
    where: { deletedAt: null, categoryId },
    skip: (page - 1) * limit,
    take: limit,
    orderBy: { createdAt: 'desc' },
  }),
]);
```

### 3.2 導購推薦模組：原子性事務處理 (`$transaction`)

當後台管理員更新文章的推薦商品時，程式採用**「全量替換」**策略，並以 transaction 將「刪除舊關聯」與「寫入新關聯」納入同一交易邊界。

我們在 `RecommendationService.setRecommendations` 中實作了 Prisma 的交互式事務 (Interactive Transactions)：

```typescript
const result = await prisma.$transaction(async (tx) => {
  // Step 1: 刪除該文章所有現有推薦關聯
  await tx.articleProductRecommendation.deleteMany({
    where: { articleId },
  });

  // Step 2: 批量寫入新的推薦關聯
  if (data.recommendations.length > 0) {
    await tx.articleProductRecommendation.createMany({
      data: data.recommendations.map((rec) => ({
        articleId,
        productId: rec.productId,
        sortOrder: rec.sortOrder,
      })),
    });
  }
  
  // Step 3: 回傳更新後的完整推薦列表
  return tx.articleProductRecommendation.findMany({ ... });
});
```

此設計讓相關寫入在同一 transaction 中成功或回滾，以降低產生「孤兒關聯」或「部分更新」資料的風險。

---

## 四、全域錯誤處理與安全性中間件

### 4.1 統一回應契約

不論是成功還是失敗，API 的回應格式都必須高度一致，以便前端進行統一的攔截器 (Interceptors) 處理與 UI 渲染。

*   **成功回應格式**：
    ```json
    {
      "success": true,
      "data": { ... },
      "message": "操作成功"
    }
    ```
*   **失敗回應格式**：
    ```json
    {
      "success": false,
      "error": {
        "code": "VALIDATION_ERROR",
        "message": "請求資料驗證失敗，請檢查輸入欄位",
        "details": [
          { "field": "slug", "message": "Slug 僅允許小寫英文、數字與連字號" }
        ]
      }
    }
    ```

### 4.2 錯誤分層處理機制

我們的全域錯誤處理中間件 (`globalErrorHandler`) 採用了**責任鏈式的分層識別**：

1.  **Zod 驗證錯誤**：捕獲並格式化為前端友善的 `details` 陣列，回傳 `400 Bad Request`。
2.  **自定義業務錯誤 (`AppError`)**：如 `NotFoundError`、`ConflictError`。直接提取自定義的 `statusCode` 與 `code`，回傳相應的 HTTP 狀態碼。
3.  **Prisma 資料庫錯誤**：
    *   `P2002` (唯一約束衝突)：自動解析衝突欄位，回傳 `409 Conflict`。
    *   `P2025` (記錄不存在)：回傳 `404 Not Found`。
    *   `P2003` (外鍵約束失敗)：回傳 `400 Bad Request`。
4.  **未知系統錯誤**：在生產環境下隱藏內部細節，僅記錄日誌，並向客戶端回傳 `500 Internal Server Error`，確保伺服器安全。

---

## 五、如何執行與測試

### 5.1 環境準備

1.  複製環境變數範例：
    ```bash
    cp .env.example .env
    ```
2.  安裝依賴（於 Monorepo 根目錄）：
    ```bash
    pnpm install
    ```
3.  生成 Prisma Client：
    ```bash
    pnpm --filter @havoice/database db:generate
    ```

### 5.2 啟動開發伺服器

```bash
# 啟動後端 API 服務 (預設監聽連接埠 4000)
pnpm --filter @havoice/api dev
```

### 5.3 核心 API 端點清單

| 功能 | 方法 | 端點 | 說明 |
|------|------|------|------|
| **健康檢查** | `GET` | `/api/health` | 檢查服務狀態與版本 |
| **文章列表** | `GET` | `/api/articles?page=1&limit=10&categoryId=xxx` | 分頁查詢，自動排除軟刪除 |
| **單一文章** | `GET` | `/api/articles/:id` | 取得文章，並帶出依 `sortOrder` 排序的推薦商品 |
| **文章(Slug)** | `GET` | `/api/articles/slug/:slug` | 前台專用，自動增加瀏覽次數 |
| **建立文章** | `POST` | `/api/articles` | 建立新文章，驗證 `CreateArticleDTO` |
| **更新文章** | `PATCH` | `/api/articles/:id` | 部分更新文章，驗證 `UpdateArticleDTO` |
| **刪除文章** | `DELETE`| `/api/articles/:id` | 軟刪除文章 (設定 `deletedAt`) |
| **商品列表** | `GET` | `/api/products?page=1&limit=10` | 分頁查詢，自動排除軟刪除 |
| **設定推薦** | `PUT` | `/api/articles/:articleId/recommendations` | 後台全量替換推薦商品，採事務處理 |
