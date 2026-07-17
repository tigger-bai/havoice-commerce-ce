# Havoice Platform — Portfolio Edition

> 從自營品牌的內容與電商營運需求出發，持續開發中的全端 Monorepo；此公開版本已移除敏感資料，改用合成 Demo 資料展示系統設計與核心流程。

## 專案背景

Havoice Platform 源於我自行經營品牌時遇到的實際需求：內容需要被持續編輯與發布，商品、會員、Customer、訂單和供應商資料需要集中管理，營運人員也需要一套能處理權限、庫存、出貨與頁面配置的後台。

這不是單純為示範 CRUD 而建立的專案。系統以真實使用情境與未來營運需求為設計依據，包含消費者前台、營運後台、REST API、共用資料契約與 Prisma 資料層。不過專案仍在持續開發，目前不代表所有功能都已完成正式環境驗證或全面上線。

## Portfolio Edition 說明

這個 Repository 是經過去識別化與安全清理的公開作品集版本。公開前已移除：

- 真實客戶資料與真實訂單
- 正式商品營運資料、商品成本與進價
- 私人營運 CSV
- 正式帳號、固定測試憑證與第三方服務設定
- 不適合公開的營運識別資訊

目前資料庫 seed 全部使用 synthetic Demo data：

| 資料 | 數量／規則 |
| --- | --- |
| Category | 5 個 Demo 分類 |
| Product | 20 個 Demo 商品 |
| User | 1 名受限 `ADMIN`、2 名 `VENDOR`、3 名 `USER` |
| Customer | 12 名 Demo Customer |
| Order | 24 筆 Demo Order |
| OrderItem | 每張訂單 1–4 筆 |

所有 Demo Email 均使用 `example.com`；Demo 訂單、SKU 與相關識別碼使用清楚的 `DEMO` 前綴，避免與正式資料混淆。

## Demo 與截圖

> Public demo deployment is being prepared.

目前尚未提供公開 Demo URL，也尚未提交公開截圖。後續預計補上：

- 前台首頁與動態內容區塊
- 商城列表與商品詳情
- 購物車、結帳與會員訂單
- 後台營運總覽、商品與訂單管理
- Customer、會員與系統帳號管理
- Page Builder 編輯畫面

此處不引用尚不存在的圖片或部署網址。

## 核心功能

### 前台 Web

- 首頁、文章列表與內容詳情
- 商城列表、商品搜尋與商品詳情
- 購物車與結帳流程
- 註冊、登入與會員中心
- 會員訂單列表、詳情與重新付款入口
- 依 `pageRoute` 載入 Page Builder 動態內容

### 後台 Admin

- 商品、分類、庫存、上下架狀態與圖片管理
- Cloudinary 圖片上傳 integration code
- 訂單列表、訂單詳情、人工訂單與狀態管理
- Customer 建立、查詢與資料維護
- 一般會員與系統帳號分域管理
- `SUPER_ADMIN`、`ADMIN`、`EDITOR`、`VENDOR`、`USER` RBAC
- 供應商使用者與多供應商資料隔離相關程式
- 首頁／商城頁 Page Builder、區塊管理與拖曳排序

### API 與整合

- Express 4 REST API，涵蓋 auth、articles、products、recommendations、orders 與 layouts
- NextAuth session 與 Bearer JWT 的認證／授權流程
- 訂單、會員端查詢及管理端 API
- 第三方 callback／webhook 處理架構
- Nodemailer Email integration code
- Cloudinary image upload integration code
- ECPay 金流與物流 integration code

第三方服務目前應視為 **Sandbox-ready architecture**：需要另外申請外部憑證並完成環境設定，不能由本 Repository 推定正式環境已完整驗證。

## 技術棧

| 類別 | 技術 |
| --- | --- |
| Web／Admin | Next.js 14、React 18、TypeScript、Tailwind CSS 3 |
| 狀態與表單 | Zustand、React Hook Form、Zod |
| Authentication | NextAuth 4、JWT、bcryptjs |
| API | Node.js、Express 4 |
| Database | MySQL、Prisma 5 |
| Monorepo | pnpm Workspace、Turborepo 1 |
| Integrations | Cloudinary、Nodemailer、ECPay integration code |

實際套件版本以各 workspace 的 `package.json` 與 lockfile 為準。

## Monorepo 架構

```text
havoice-platform-portfolio/
├── apps/
│   ├── web/               # 消費者前台，預設 port 3000
│   ├── admin/             # 營運後台，預設 port 3001
│   └── api/               # Express REST API，預設 port 4000
├── packages/
│   ├── database/          # Prisma schema、client、migrations 與 Demo seed
│   ├── shared/            # 共用 Zod schemas、DTO、types 與整合 helper
│   ├── eslint-config/     # 共用 ESLint 設定
│   └── typescript-config/ # 共用 TypeScript 設定
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

## 系統流程

1. **內容與商品瀏覽**：Web 透過 API 取得文章、推薦商品、商品目錄與 Page Builder 區塊。
2. **會員與認證**：使用者註冊／登入後，以 NextAuth session 或 Bearer JWT 存取受保護功能。
3. **購物車與結帳**：前台組合商品與收件資料，建立 Order、OrderItem 與 OrderRecipient。
4. **營運管理**：Admin 依角色管理商品、Customer、會員、訂單、供應商與頁面內容。
5. **第三方流程**：金流、物流、Email 與圖片上傳由獨立 integration code 處理；實際呼叫需要外部 Sandbox 憑證。

Admin 同源 Next.js Route Handlers 與 Express API 目前並存：後台營運模組多使用同源 API，公開內容、認證及部分訂單／整合流程由 Express API 提供。

## Demo seed 與資料庫

公開 seed 位於 `packages/database/prisma/seed.ts`，使用 deterministic upsert 建立 Demo catalog、角色使用者、Customer、Order、OrderItem 與 OrderRecipient。

- seed 可重複執行，不會用全表刪除清除 User、Customer、Product 或 Order。
- 只依 Demo slug、Email、ID、SKU 與訂單編號更新對應 Demo 資料。
- Demo 使用者密碼必須由本機環境變數 `DEMO_USER_PASSWORD` 提供。
- 未設定密碼或密碼不符合專案規則時，seed 會在資料庫操作前停止。
- README 不提供任何固定 Demo 密碼。

> **警告：**只能對專用的本機 Demo MySQL database 執行 `db:push` 與 `db:seed`。請先逐字確認 `DATABASE_URL`，不得對正式、共用或含營運資料的資料庫執行。

## 本機啟動方式

### 前置需求

- Node.js 18 以上
- pnpm 8
- MySQL 8

### 1. 安裝 dependencies

```bash
pnpm install
```

根層 `postinstall` 目前使用非 scoped workspace filter；若安裝階段無法正確找到 database workspace，請先檢查根 `package.json`，不要自行改用未知指令或連接正式資料庫。

### 2. 建立本機環境檔

依執行方式複製需要的範本，並在本機填入設定：

```bash
cp .env.example .env
cp apps/web/.env.example apps/web/.env.local
cp apps/admin/.env.example apps/admin/.env.local
cp apps/api/.env.example apps/api/.env
cp packages/database/.env.example packages/database/.env
```

上述檔案只能放本機設定，不應提交真實秘密。

### 3. 建立專用 Demo MySQL database

在本機 MySQL 建立一個全新的空白 Demo database，並讓根目錄及 database workspace 的 `DATABASE_URL` 指向同一個 Demo database。不要重用任何營運資料庫。

### 4. 產生 Prisma Client

```bash
pnpm --filter @havoice/database db:generate
```

### 5. 初始化 Demo schema

再次確認 `DATABASE_URL` 後執行：

```bash
pnpm --filter @havoice/database db:push
```

### 6. 執行 Demo seed

先在目前 shell 明確設定 `DEMO_USER_PASSWORD`，不要把密碼寫進 README、程式碼或版本控制，再執行：

```bash
pnpm --filter @havoice/database db:seed
```

### 7. 啟動開發環境

```bash
pnpm dev
```

預設服務：

| 服務 | URL |
| --- | --- |
| Web | `http://localhost:3000` |
| Admin | `http://localhost:3001` |
| API | `http://localhost:4000` |

也可以使用各 workspace 已存在的 `dev` script 個別啟動：

```bash
pnpm --filter @havoice/web dev
pnpm --filter @havoice/admin dev
pnpm --filter @havoice/api dev
```

## 環境變數

README 只說明用途；實際值必須由開發者在本機或部署平台安全提供。

| 類別 | 主要用途 |
| --- | --- |
| Database | MySQL 連線與 Prisma Client |
| NextAuth／JWT | session、token 簽章及跨 app 認證 |
| `DEMO_USER_PASSWORD` | 本機 Demo 使用者密碼，seed 必填 |
| API／Web／Admin URLs | app 間請求、callback 與導向網址 |
| SMTP | 訂單相關 Email integration code |
| Cloudinary | 後台商品圖片上傳 integration code |
| ECPay Sandbox | 金流、選店、callback 與物流 integration code |
| CORS | Express API 的允許來源白名單 |

`Environment variable examples are still being consolidated`：現有 `.env.example` 尚未完整涵蓋所有程式實際讀取的 public URL、CORS、SMTP、Cloudinary 與物流變數。啟用第三方功能前，請先依程式碼與 Sandbox 官方設定逐項核對，不要使用正式憑證測試作品集。

## 常用 scripts

以下指令均存在於目前的 package scripts；本 README 不代表本輪已實際執行驗證。

| 指令 | 用途 | 目前限制 |
| --- | --- | --- |
| `pnpm dev` | 透過 Turborepo 啟動 workspace dev tasks | 需要各 app 的本機環境設定 |
| `pnpm build` | generate Prisma Client 後執行 Turbo build | 根 script 使用非 scoped database filter，公開前需再確認 |
| `pnpm lint` | 執行 Turbo lint task | 可能先觸發上游 build |
| `pnpm type-check` | 執行 Turbo type-check task | 各 workspace 尚未一致定義 `type-check` script，不能宣稱已完整覆蓋 |
| `pnpm db:generate` | 轉發 database Prisma generate | 尚未於本輪執行 |
| `pnpm db:push` | 將 schema 同步到資料庫 | 僅限全新本機 Demo DB |
| `pnpm db:seed` | 執行 synthetic Demo seed | 需要 `DEMO_USER_PASSWORD`，僅限 Demo DB |
| `pnpm format` | 以 Prettier 寫入格式化結果 | 會修改檔案，執行前先確認範圍 |
| `pnpm --filter @havoice/database db:migrate` | Prisma development migration | 不應用於正式資料庫或本 README 的快速 Demo 流程 |
| `pnpm --filter @havoice/database db:studio` | 開啟 Prisma Studio | 會存取指定資料庫，先確認連線目標 |

## 安全與隱私

- Repository 不應包含真實客戶、訂單、電話、地址、商品成本或私人營運 CSV。
- Demo Email 使用保留用途網域，識別碼使用清楚的 Demo 前綴。
- 密碼、JWT／NextAuth secrets、SMTP、Cloudinary 與 ECPay 憑證只能由環境變數提供。
- `.env`、`.env.local` 與其他本機秘密不得提交版本控制。
- 第三方 callback／webhook integration code 不代表正式環境已完成認證。
- 執行任何 Prisma 指令前，必須確認目標是可丟棄的本機 Demo database。

## 已完成

以下項目有目前 repository 中的程式碼入口：

- Web／Admin／API Monorepo 與共用 packages
- 文章、商品、推薦商品與分類相關功能
- 商品 CRUD、庫存狀態與圖片上傳整合
- 註冊、登入、會員中心與角色權限守衛
- Customer、一般會員與系統帳號管理
- 訂單建立、查詢、管理、人工訂單與收件資料
- 多供應商欄位、供應商角色與部分資料隔離流程
- Page Builder 區塊管理、排序及前台渲染
- Email、Cloudinary、ECPay 金流／物流 integration code
- 可重複執行且關聯完整的 synthetic Demo seed

「已完成」代表程式碼與路由存在，不等同所有外部服務均已通過目前版本的端對端驗證。

## 開發中

- 自動化單元、整合與端對端測試
- CI/CD 與公開 Demo 部署
- 文件與程式碼版本一致性整理
- 第三方 Sandbox E2E 驗證
- Order controller／service 職責拆分
- 統一環境變數載入與驗證
- Logging、metrics、tracing 與錯誤監控

## Roadmap

1. 統一 workspace 的 lint、type-check 與 test scripts。
2. 建立核心 auth、order、RBAC 與 Demo seed 自動化測試。
3. 完成第三方 Sandbox 測試矩陣與安全 callback 驗證。
4. 建立 CI pipeline 與不含敏感資料的公開 Demo 環境。
5. 補齊系統架構圖、ER Diagram、流程圖與操作截圖。
6. 整理歷史交付文件，建立可追溯的架構決策紀錄。

## 專案限制

- 尚無完整自動化測試套件。
- 尚未提供公開 Demo URL 或 repository 內截圖。
- 部分第三方服務需要開發者自行申請 Sandbox 憑證。
- 部分歷史文件仍待更新，可能描述較早期的架構狀態。
- 目前不能保證所有 workspace 的 type-check 已由單一根指令完整驗證。
- 現有環境變數範本仍在整併，啟用整合功能前需對照程式碼確認。
- 系統仍在持續開發，不應解讀為已全面正式上線。

## 作者與聯絡方式

本專案的主要設計與開發源於作者的自營品牌營運需求。

- GitHub: `https://github.com/<your-username>`
- Contact: `<public-contact-email>`

> 公開前請由作者人工替換以上 placeholder；不要填入正式客服信箱、私人 Email 或未確認可公開的聯絡方式。

## License 狀態

**License pending.** Repository 目前尚未包含 `LICENSE` 檔；公開發布前將由作者確認並加入適用授權。
