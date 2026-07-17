# 快樂之音 (Joyful Voice) — 平台架構設計文件

> **版本**：v1.0.0  
> **日期**：2026-06-02  
> **技術棧**：Next.js 14+ (App Router) · Express · TypeScript · Tailwind CSS · Prisma · MySQL · Zustand · Zod

---

## 一、Monorepo 架構總覽

「快樂之音」採用 **pnpm workspace + Turborepo** 的 Monorepo 架構，將前台網站、後台管理面板、後端 API 服務以及共用套件統一管理於單一程式碼倉庫之中。此設計用來維持模組邊界、共用型別與工作區間的一致性。

```
/havoice-platform
  ├── apps/
  │   ├── web/           # 前台網站 (Next.js) — 消費者與讀者端
  │   ├── admin/         # 後台管理 (Next.js) — CMS/儀表板
  │   └── api/           # 後端微服務 (Express) — RESTful API
  ├── packages/
  │   ├── database/      # Prisma 模組 (schema, migrations, seed, PrismaClient)
  │   ├── shared/        # 共用型別介面與 Zod DTOs
  │   ├── eslint-config/ # 全域 ESLint 規範
  │   └── typescript-config/ # 全域 tsconfig 基礎設定
  ├── turbo.json
  ├── pnpm-workspace.yaml
  ├── package.json
  └── .env.example
```

---

## 二、`packages/shared` 如何提升開發效率與程式碼品質

### 2.1 問題背景：前後端型別不一致的痛點

在傳統的前後端分離架構中，前端與後端可能各自維護資料結構定義。當後端 API 的回傳格式變更時，前端可能到 Runtime 才發現型別不匹配，增加追蹤問題的成本；共用契約可降低這類 Contract Drift 風險。

### 2.2 解決方案：Single Source of Truth

`packages/shared` 作為整個 Monorepo 的「契約中心 (Contract Hub)」，集中定義所有 **TypeScript 介面 (Interfaces)**、**Zod 驗證 Schema** 以及 **DTO (Data Transfer Objects)**。前端 (`apps/web`、`apps/admin`) 與後端 (`apps/api`) 均直接引用此套件，確保型別定義的唯一來源。

```typescript
// packages/shared/src/schemas/product.schema.ts
import { z } from 'zod';

export const CreateProductSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9-]+$/),
  price: z.number().positive().multipleOf(0.01),
  categoryId: z.string().uuid(),
});

export type CreateProductDTO = z.infer<typeof CreateProductSchema>;
```

這段程式碼同時被後端用於 Request Body 驗證，也被前端用於表單驗證——任何欄位的變更都會在 **編譯期 (Compile Time)** 立即觸發所有相關模組的型別錯誤，而非等到 Runtime 才爆炸。

### 2.3 效益量化

| 面向 | 傳統分離架構 | Monorepo + shared package |
|------|-------------|--------------------------|
| 型別同步 | 手動維護，易漂移 | 自動同步，編譯期即可捕獲 |
| API 契約變更影響範圍 | 需人工通知前端團隊 | Turborepo 自動觸發相依模組重建 |
| 驗證邏輯 | 前後端各寫一份 | 撰寫一次，前後端共用 |
| 新人上手成本 | 需理解多份重複定義 | 單一來源，結構清晰 |
| CI/CD 信心度 | 低（隱性契約） | 高（顯性契約 + 編譯檢查） |

---

## 三、Turborepo 任務編排與快取

### 3.1 核心機制：任務圖 (Task Graph) 與遠端快取 (Remote Caching)

Turborepo 將 Monorepo 中各套件的建構任務建模為一張 **有向無環圖 (DAG)**。它能自動分析套件之間的依賴關係，並以最大平行度執行不相依的任務。更關鍵的是，Turborepo 會對每次建構的輸入（原始碼、環境變數、依賴版本）計算 Hash，若 Hash 未變，則直接從快取中取出上次的建構產物，跳過實際編譯。

### 3.2 `turbo.json` 設計哲學

```jsonc
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "dist/**"]
    },
    "lint": {
      "dependsOn": ["^build"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "db:generate": {
      "cache": false
    }
  }
}
```

`"dependsOn": ["^build"]` 表示：在建構當前套件之前，必須先完成其所有上游依賴的建構。例如 `apps/web` 依賴 `packages/shared`，Turborepo 會確保 `shared` 先建構完成，再啟動 `web` 的建構——這一切都是自動推導的，無需手動編排。

### 3.3 預期效益

當 `packages/shared` 等共用套件變更時，Turborepo 可依任務圖執行受影響的工作區，並在設定正確時利用快取避免重複工作。實際建構時間與快取效益尚未建立可重現的基準數據，因此本文不提供量化保證。

---

## 四、資料庫架構設計 (Prisma Schema)

### 4.1 設計原則

本 Schema 採用下列資料建模原則：

| 原則 | 實作方式 |
|------|---------|
| 安全性 | 主鍵一律使用 UUID (`@default(uuid())`)，避免自增 ID 的可預測性攻擊 |
| 精確性 | 金額欄位使用 `Decimal(10, 2)`，避免浮點數精度問題 |
| 效能 | 針對高頻查詢欄位 (email, slug, categoryId, orderId) 建立索引 |
| 資料保護 | 關鍵業務資料 (User, Article, Product, Order, Video) 採用軟刪除 (`deletedAt`) |
| 歷史完整性 | OrderItem 快照商品名稱與價格，確保歷史訂單不受商品修改影響 |
| 業務擴展性 | 狀態使用 Enum 管理，便於未來擴充工作流程 |

### 4.2 Entity-Relationship 概覽

```
┌─────────┐       ┌──────────┐       ┌─────────┐
│  User   │──1:N──│ Article  │──N:M──│   Tag   │
└─────────┘       └──────────┘       └─────────┘
     │                  │                  │
     │ 1:N              │ N:M              │ N:M
     ▼                  ▼                  ▼
┌─────────┐   ┌────────────────────┐  ┌─────────┐
│  Order  │   │ ArticleProduct     │  │ Product │
└─────────┘   │ Recommendation     │  └─────────┘
     │        │ (sortOrder 排序)   │       │
     │ 1:N    └────────────────────┘       │
     ▼                                     │
┌───────────┐                              │
│ OrderItem │──────────────────────────────┘
└───────────┘

┌──────────┐
│ Category │──(自關聯：parent/children 樹狀結構)
└──────────┘
```

### 4.3 模型清單與職責

| 模型 | 職責 | 關鍵設計決策 |
|------|------|-------------|
| **User** | 使用者帳號與權限 | Role Enum 區分 USER/EDITOR/ADMIN；UserStatus 支援停權與軟刪除 |
| **Category** | 分類系統（內容與商城共用） | 自關聯實現無限層級樹狀結構；slug 唯一索引支援 SEO 友善路由 |
| **Tag** | 標籤系統 | 透過顯式 Join Table 實現多對多，避免隱式表的不可控性 |
| **Article** | 文章內容 | LongText 支援富文本；PublishStatus 管理發佈工作流 |
| **Video** | 影音內容 | 獨立模型，支援未來擴展為獨立影音平台 |
| **Product** | 商品 | compareAtPrice 支援促銷折扣顯示；SKU 唯一約束 |
| **CartItem** | 購物車 | `@@unique([userId, productId])` 防止重複加入 |
| **Order** | 訂單主表 | 雙狀態 (OrderStatus + PaymentStatus) 分離物流與金流 |
| **OrderItem** | 訂單明細 | 快照 productName 與 productPrice 確保歷史不可變性 |
| **ArticleProductRecommendation** | 導購推薦關聯 | sortOrder 控制推薦商品排序；複合主鍵確保唯一性 |

### 4.4 導購推薦關聯表：核心業務特色

`ArticleProductRecommendation` 是本平台的核心差異化功能。它建立了「內容」與「商品」之間的橋樑，使編輯人員能夠在撰寫文章時，精確地關聯推薦商品並控制其展示順序。`sortOrder` 欄位（數字越小越靠前）讓前台能以確定性的順序渲染推薦列表，而非依賴不穩定的資料庫預設排序。

---

## 五、`packages/database` 模組職責

此套件封裝了所有資料庫相關的邏輯，對外僅暴露 PrismaClient 實例與型別：

```
packages/database/
  ├── prisma/
  │   └── schema.prisma    # 資料庫 Schema 定義
  ├── src/
  │   └── index.ts         # 導出 PrismaClient 單例與型別
  ├── package.json
  └── tsconfig.json
```

其他套件透過 `import { prisma } from '@havoice/database'` 即可取得型別安全的資料庫存取能力，無需各自初始化連線或管理 Schema。

---

## 六、總結

本架構設計的核心理念是 **「邊界清晰、契約顯性、集中編排」**。pnpm workspace 管理工作區相依，`packages/shared` 集中共用契約，Turborepo 負責任務編排與快取。

此架構已為後續的業務邏輯開發奠定了堅實的基礎設施層，下一步可依序進行：
1. 初始化各 `apps/` 與 `packages/` 的 `package.json` 與基礎設定
2. 實作 `packages/shared` 中的 Zod Schema 與 DTO
3. 建構 `apps/api` 的 Express 路由與中間件
4. 開發 `apps/web` 與 `apps/admin` 的頁面與元件
