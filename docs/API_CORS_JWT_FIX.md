# apps/api：CORS 跨域修復與 JWT 全域防護

> 本文件包含歷史修復與驗證紀錄，不代表目前 build、typecheck 或執行期測試持續通過；現況以程式碼與最新文件為準。

本文件說明本次針對 `apps/api`（Express + TypeScript，Port 4000）的兩項生產環境等級重構：**多來源 CORS 解析**與 **JWT Auth Guard 防護**，以及為使整體 `tsc` 建置歸零所做的既有問題修正。

## 一、問題背景

`apps/admin`（Port 3001）呼叫 `apps/api`（Port 4000）的 `/articles` 等端點時，瀏覽器回報 `No Access-Control-Allow-Origin header` 而被攔截。同時，後台寫入類端點（建立／更新／刪除文章、商品）缺乏伺服器端的身分與權限防護。

## 二、CORS 多來源解析修復

新增集中設定模組 `src/config/cors.ts`，並在應用進入點最上方載入環境變數。

### 設計重點

| 項目 | 做法 |
| --- | --- |
| 讀取來源 | 讀取 `.env` 的 `CORS_ORIGIN`，以 `.split(',')` 轉為陣列 |
| 清理 | 對每個來源 `trim()`、移除前後引號殘留與尾端斜線，避免 `.env` 撰寫差異造成放行失敗 |
| 放行策略 | 採用 `origin` 驗證函式，精準比對白名單；對無 `Origin` 的請求（curl／server-to-server／健康檢查）放行 |
| 認證支援 | `credentials: true`，並允許 `Authorization`／`Content-Type` 標頭與常用方法 |
| 後備值 | `CORS_ORIGIN` 缺漏時退回 `http://localhost:3000` 與 `http://localhost:3001` |

`.env` 範例（`.env.example` 已具備）：

```
CORS_ORIGIN="http://localhost:3000,http://localhost:3001"
```

### dotenv 載入

新增 `src/config/env.ts`，於 `server.ts` 與 `app.ts` 最上方 `import './config/env'`，依序載入 `apps/api/.env` 與 Monorepo 根目錄 `.env`，確保 `tsx watch`（dev）與 `node dist`（build 後）皆能讀到變數，並對 `JWT_SECRET` 缺漏提出啟動期警示。

## 三、JWT 全域防護（Auth Guard）

`apps/api` 的認證 middleware 由 `src/middlewares/auth.middleware.ts` 提供，目前驗證順序為：

- `authenticateJWT`（別名 `jwtMiddleware`）：優先以 NextAuth `getToken` 搭配 `NEXTAUTH_SECRET` 解析 cookie/header token；若未取得 NextAuth token，再使用 `Authorization: Bearer <token>` 搭配 `JWT_SECRET` 驗證。
- `requireRole(...roles)`：RBAC 角色守衛，須先經 `authenticateJWT`，角色不符回 403 `FORBIDDEN`。
- `requireAdmin`：便捷組合 `[authenticateJWT, requireRole('SUPER_ADMIN', 'ADMIN', 'EDITOR')]`，路由以 `...requireAdmin` 展開套用。

### 受保護路由套用情形

| 路由 | GET（公開讀取） | POST／PUT／PATCH／DELETE（寫入） |
| --- | --- | --- |
| `/api/articles` | 公開 | `...requireAdmin` |
| `/api/products` | 公開 | `...requireAdmin` |
| `/api/articles/:articleId/recommendations` | 公開 | PUT 套用 `...requireAdmin` |

公開 GET 維持開放以供前台讀取，寫入操作需登入且具備 `SUPER_ADMIN`、`ADMIN` 或 `EDITOR` 權限。

## 四、為使 `tsc` 歸零的既有問題修正

型別檢查時發現多項**先前階段遺留、與本次改動無關**的阻斷性錯誤，為達成「建置通過」之交付要求一併以最小範圍修正（不更動業務邏輯）：

1. **`AppError` 參數順序**：全專案 14 處呼叫皆採 `(statusCode, message, code)`，但類別建構子定義為 `(message, statusCode, code)`。修正建構子順序以匹配所有呼叫點（單檔修正，零呼叫端改動）。
2. **`password` → `passwordHash`**：`auth.service.ts` 註冊寫入與登入比對的欄位名與 schema 對齊。
3. **`note` → `notes` 並補必填 `shippingAddress`**：`order.service.ts` 建立訂單的欄位與 schema 對齊。
4. **`validate.middleware.ts`**：修正索引存取的型別轉換（先轉 `unknown`）。
5. **Express 型別可移植性（TS2742）**：為 `app` 與各 `Router` 補上明確型別註解（`Express` / `Router`）。
6. **補齊依賴**：`jsonwebtoken`、`@types/jsonwebtoken`、`dotenv`、`bcryptjs`、`@types/bcryptjs`。

## 五、歷史驗證結果

> 以下結果是當時修復工作的紀錄，本次未重新執行 build、typecheck 或本地 API 測試。

### 型別與建置

- `apps/api` 之 `tsc --noEmit`：**通過（exit 0）**
- `apps/api` 之 `tsc`（build）：**通過（exit 0）**，`dist/` 正常產出

### 執行期行為（本地實測）

| 測試 | 結果 |
| --- | --- |
| `OPTIONS /api/articles`，`Origin: http://localhost:3001` | 204，`Access-Control-Allow-Origin: http://localhost:3001`、`Access-Control-Allow-Credentials: true` |
| `OPTIONS /api/articles`，`Origin: http://localhost:3000` | 204，正確回對應 ACAO |
| `OPTIONS /api/articles`，`Origin: http://localhost:9999`（未授權） | 不回 ACAO（被擋） |
| `POST /api/articles`（無 Token） | 401 `MISSING_TOKEN`「未提供認證 Token，請先登入」 |
| `POST /api/articles`（無效 Token） | 401 |
| `PATCH /api/products/:id`（無 Token） | 401 |
| `GET /api/articles`（公開） | 未被權限攔截（非 401；500 僅因本地無資料庫連線） |

## 六、更新／新增檔案清單

- 新增：`src/config/cors.ts`、`src/config/env.ts`
- 修改：`src/app.ts`、`src/server.ts`、`src/services/auth.service.ts`、`src/services/order.service.ts`、`src/controllers/order.controller.ts`（連帶型別）、`src/middlewares/auth.middleware.ts`、`src/middlewares/index.ts`、`src/middlewares/validate.middleware.ts`、`src/utils/app-error.ts`
- 路由套用守衛：`src/routes/article.routes.ts`、`src/routes/product.routes.ts`、`src/routes/recommendation.routes.ts`、`src/routes/auth.routes.ts`、`src/routes/order.routes.ts`
- 依賴：`package.json`（新增 `jsonwebtoken`、`dotenv`、`bcryptjs` 及對應型別）
