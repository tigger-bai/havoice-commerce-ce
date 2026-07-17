# Environment Variable Matrix

本文件依目前 source code、設定檔與 package scripts 整理。範例值僅供本機或 Sandbox 使用；不得提交真實密碼、Token、HashKey、HashIV、Merchant ID、SMTP 憑證或正式營運網址。

## 使用原則

- 根目錄 `.env.example` 是跨 workspace 的本機總覽；各 workspace 的 `.env.example` 才是該程式的權威範本。
- `NEXT_PUBLIC_*` 會暴露給瀏覽器，只能放公開 URL、公開聯絡資訊等非秘密值。
- `DATABASE_URL`、認證密鑰、SMTP 密碼、Cloudinary secret 與 ECPay 金鑰都是 server-only。
- ECPay、SMTP、Cloudinary 與郵局設定為可選整合；啟用對應流程時才成為 required。公開範本只使用安全 placeholder。
- `NODE_ENV` 由執行環境使用；`npm_package_version` 由套件執行器注入，不列入範本。

## 根目錄共用總覽

| 變數 | 可見性 | 條件 | 用途 |
| --- | --- | --- | --- |
| `NODE_ENV` | Server-only | Optional / Runtime | development、test、production 行為切換 |
| `DATABASE_URL` | Server-only secret | Required | Prisma / MySQL 連線 |
| `API_PORT` | Server-only | Optional | API port，預設 4000 |
| `API_BASE_URL` | Server-only | Required for order/payment/logistics flows | API callback base URL |
| `WEB_BASE_URL` | Server-only | Required for payment redirect | Web redirect base URL |
| `CORS_ORIGIN` | Server-only | Production-required | 逗號分隔的 API CORS allowlist |
| `NEXTAUTH_SECRET` | Server-only secret | Production-required | NextAuth session/JWT 驗證；API 必須與 NextAuth app 一致 |
| `JWT_SECRET` | Server-only secret | Production-required | API 自有 JWT 簽章 |
| `JWT_EXPIRES_IN` | Server-only | Optional | API JWT 有效期，預設 `7d` |
| `DEMO_USER_PASSWORD` | Server-only secret | Required only for demo seed | Demo 使用者的本機 seed 密碼 |

## apps/web

| 變數 | 可見性 | 條件 | 用途 |
| --- | --- | --- | --- |
| `DATABASE_URL` | Server-only secret | Required | NextAuth Prisma adapter |
| `NEXTAUTH_URL` | Server-only | Required for NextAuth deployment | Web callback origin |
| `NEXTAUTH_SECRET` | Server-only secret | Production-required | NextAuth session/JWT |
| `NEXT_PUBLIC_API_URL` | Client-exposed | Production-required | 共用 API client base URL |
| `NEXT_PUBLIC_API_BASE_URL` | Client-exposed | Production-required for checkout | Checkout API base URL |
| `NEXT_PUBLIC_ADMIN_URL` | Client-exposed | Optional | 後台入口 URL |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | Client-exposed | Optional | 公開客服 Email；安全 fallback 為 `contact@example.com` |
| `API_BASE_URL` | Server-only | Required for repayment | Payment callback base URL |
| `WEB_BASE_URL` | Server-only | Required for repayment | Payment client redirect base URL |
| `ECPAY_MERCHANT_ID` | Server-only | Sandbox-only / integration-required | Payment merchant identifier |
| `ECPAY_HASH_KEY` | Server-only secret | Sandbox-only / integration-required | Payment CheckMacValue key |
| `ECPAY_HASH_IV` | Server-only secret | Sandbox-only / integration-required | Payment CheckMacValue IV |
| `ECPAY_ACTION_URL` | Server-only | Sandbox-only / integration-required | Repayment form action；優先名稱 |
| `ECPAY_AIO_CHECKOUT_URL` | Server-only | Sandbox-only / Optional alias | Repayment form action fallback |
| `NEXT_PUBLIC_ECPAY_AIO_CHECKOUT_URL` | Client-exposed | Sandbox-only / checkout-required | 公開的付款表單 endpoint；不含憑證 |

## apps/admin

| 群組 | 變數 | 可見性 | 條件 |
| --- | --- | --- | --- |
| Core | `DATABASE_URL`, `NEXTAUTH_SECRET` | Server-only secret | Required / production-required |
| Core | `NEXTAUTH_URL`, `API_BASE_URL` | Server-only | Required for auth / logistics callback |
| Public | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WEB_URL` | Client-exposed | Production-required / optional |
| Cloudinary | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Server-only; secret for API secret | Optional; upload-required |
| SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Server-only; credentials secret | Optional; mail-required; `SMTP_FROM` production-required when sending |
| ECPay payment | `ECPAY_MERCHANT_ID`, `ECPAY_HASH_KEY`, `ECPAY_HASH_IV`, `ECPAY_PLATFORM_ID` | Server-only; keys secret | Sandbox-only / integration-required; platform ID optional |
| ECPay C2C | `ECPAY_LOGISTICS_MERCHANT_ID`, `ECPAY_LOGISTICS_HASH_KEY`, `ECPAY_LOGISTICS_HASH_IV`, `ECPAY_LOGISTICS_URL` | Server-only; keys secret | Sandbox-only / logistics-required |
| ECPay post | `ECPAY_LOGISTICS_API_URL`, `ECPAY_LOGISTICS_PRINT_API_URL`, `ECPAY_LOGISTICS_SERVER_REPLY_URL` | Server-only | Sandbox-only / real-mode-required; print URL optional if derivable |
| ECPay sender | `ECPAY_LOGISTICS_SENDER_NAME`, `ECPAY_LOGISTICS_SENDER_PHONE`, `ECPAY_LOGISTICS_SENDER_ZIP_CODE`, `ECPAY_LOGISTICS_SENDER_ADDRESS` | Server-only personal/business data | Real-mode-required |
| ECPay post | `ECPAY_POST_OFFICE_MODE`, `ECPAY_POST_OFFICE_DEFAULT_GOODS_WEIGHT`, `ECPAY_POST_OFFICE_DEFAULT_RECEIVER_ZIP_CODE` | Server-only | Optional; mode defaults by environment, receiver zip is fallback-only |
| Sender aliases | `SENDER_NAME`, `SENDER_PHONE` | Server-only personal/business data | Legacy aliases still read by C2C and post flows |
| Post office | `POST_OFFICE_ENABLED`, `POST_OFFICE_API_URL`, `POST_OFFICE_CUSTOMER_ID`, `POST_OFFICE_API_KEY`, `POST_OFFICE_SENDER_NAME`, `POST_OFFICE_SENDER_PHONE`, `POST_OFFICE_SENDER_ADDRESS` | Server-only; API key secret | Optional; required only when enabled |

`POST_OFFICE_ACCOUNT` is an alias of `POST_OFFICE_CUSTOMER_ID`，`POST_OFFICE_SECRET` is an alias of `POST_OFFICE_API_KEY`。範本只保留主要名稱，避免同一憑證重複定義。

## apps/api

| 群組 | 變數 | 可見性 | 條件 |
| --- | --- | --- | --- |
| Runtime | `NODE_ENV`, `API_PORT` | Server-only | Optional; port defaults to 4000 |
| Database | `DATABASE_URL` | Server-only secret | Required |
| URLs/CORS | `API_BASE_URL`, `WEB_BASE_URL`, `CORS_ORIGIN` | Server-only | Order/payment required; CORS production-required |
| Auth | `NEXTAUTH_SECRET`, `JWT_SECRET`, `JWT_EXPIRES_IN` | Server-only; secrets except expiry | Secrets production-required; expiry optional |
| SMTP | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Server-only; credentials secret | Optional; mail-required; `SMTP_FROM` production-required when sending |
| ECPay payment | `ECPAY_MERCHANT_ID`, `ECPAY_HASH_KEY`, `ECPAY_HASH_IV` | Server-only; keys secret | Sandbox-only / payment-required |
| ECPay logistics | `ECPAY_LOGISTICS_MERCHANT_ID`, `ECPAY_LOGISTICS_HASH_KEY`, `ECPAY_LOGISTICS_HASH_IV`, `ECPAY_LOGISTICS_URL`, `ECPAY_MAP_URL` | Server-only; keys secret | Sandbox-only / logistics-required |
| Sender | `SENDER_NAME`, `SENDER_PHONE` | Server-only personal/business data | Logistics-required |

API 不讀取 `ALLOWED_ORIGINS`、`PORT` 或 `LOG_LEVEL`；實際名稱分別是 `CORS_ORIGIN`、`API_PORT`，目前沒有可設定的 log-level 變數。

## packages/database

| 變數 | 可見性 | 條件 | 用途 |
| --- | --- | --- | --- |
| `DATABASE_URL` | Server-only secret | Required | Prisma client、schema 與 scripts |
| `NODE_ENV` | Server-only | Optional / Runtime | Prisma client logging 與 global cache 行為 |
| `DEMO_USER_PASSWORD` | Server-only secret | Required only for demo seed | Demo User 密碼來源；缺少時 seed 停止 |
| `PROMOTE_EMAIL` | Server-only personal data | Optional | 手動升級角色目標；也可用 CLI argument |

`packages/shared` 僅依 `NODE_ENV` 控制除錯輸出，不需要獨立 `.env.example`。

## 已知命名重疊與限制

- Web 同時讀取 `NEXT_PUBLIC_API_URL` 與 `NEXT_PUBLIC_API_BASE_URL`；兩者用途相近但由不同模組讀取，現階段範本必須同時保留。
- Server callback 使用 `API_BASE_URL` / `WEB_BASE_URL`，瀏覽器端使用 `NEXT_PUBLIC_*`；不能互相替代。
- Admin 的 ECPay 流程同時存在 payment merchant 與 logistics merchant 兩組名稱，並保留 `SENDER_*` 舊 alias。
- ECPay post-office 列印與建單 endpoint 使用 `ECPAY_LOGISTICS_PRINT_API_URL` / `ECPAY_LOGISTICS_API_URL`，C2C 建單則使用 `ECPAY_LOGISTICS_URL`。
- Source code 仍包含供 development 使用的第三方 Sandbox fallback 與 endpoint。這些不是 `.env.example` 憑證，但公開前仍應另行安全審查；本階段依限制未修改 source code。

