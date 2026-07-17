# 後台商品圖片上傳模組（Cloudinary）— 交付說明

> 本文件保留實作交付背景；驗證結果為歷史紀錄，現況以程式碼為準。

本次任務將 `apps/admin` 商品表單的封面圖由「手動輸入網址」升級為「支援拖曳的實體檔案上傳」，並串接 Cloudinary 雲端儲存。所有程式碼位於 `apps/admin/src/`，未更動 `apps/web`，亦未影響既有商品 CRUD 邏輯。

## 一、新增與修改的檔案

| 類型 | 路徑 | 說明 |
| --- | --- | --- |
| API（新增） | `apps/admin/src/app/api/upload/route.ts` | 接收 `multipart/form-data`，整合 Cloudinary SDK 上傳並回傳 `secure_url` |
| 元件（新增） | `apps/admin/src/components/ui/ImageUpload.tsx` | 支援 Drag & Drop 的圖片上傳元件 |
| 元件（修改） | `apps/admin/src/components/products/ProductForm.tsx` | 將 coverImage 文字輸入替換為 ImageUpload，透過 RHF Controller 接入 |
| Layout（修改） | `apps/admin/src/app/layout.tsx` | 移除與 AuthProvider 重複的 ToastProvider 包裹 |
| 設定（修改） | `.env.example` | 補上 `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` |

## 二、後端上傳 API（POST /api/upload）

- **Runtime**：宣告 `export const runtime = 'nodejs'`，因 Cloudinary SDK 需使用 Buffer / stream。
- **權限**：先呼叫 `requireAdminSession()`（基於 `getServerSession`），允許 `SUPER_ADMIN` / `ADMIN` / `EDITOR`。
- **環境變數**：請求時讀取三個 Cloudinary 變數，缺漏時回傳 `CLOUDINARY_NOT_CONFIGURED` 明確錯誤而非崩潰。
- **Server-side 防呆**：再次驗證檔案存在、MIME 類型（jpg/png/webp/gif）、大小 ≤ 5MB、非空，避免繞過前端限制。
- **上傳方式**：將檔案轉為 `Buffer`，再組成 Base64 Data URI，交由 `cloudinary.uploader.upload` 上傳；成功後回傳 `secure_url`、`public_id` 等。此流程不使用 `upload_stream`。

## 三、前端 ImageUpload 元件

- **互動**：支援拖曳放置與點擊選檔兩種方式；拖曳時邊框高亮。
- **前端防呆**：僅允許圖片格式、單張 ≤ 5MB、非空檔案，違規即觸發中文 Toast 錯誤提示。
- **流程回饋**：選檔後立即上傳，上傳中顯示 Spinner，並透過 `onUploadingChange` 通知父表單停用提交按鈕（防重複送出）。
- **預覽與操作**：已有圖片時顯示預覽，提供「更換圖片」與「移除」；上傳成功後以 `secure_url` 回填 RHF 欄位並顯示成功 Toast。
- **錯誤處理**：格式、大小、網路、伺服器錯誤皆以明確中文 Toast 呈現，畫面不崩潰。

## 四、與表單的無縫整合

- 使用 React Hook Form 的 `Controller` 控制 `coverImage` 欄位，`ImageUpload` 的 `onChange` 直接寫回欄位值。
- 驗證契約沿用 shared 的 `CreateProductSchema`，`coverImage` 仍為「有效 URL」（Cloudinary `secure_url` 為合法 URL）。
- 提交按鈕停用條件由 `isSubmitting` 擴充為 `isSubmitting || isUploading`，確保圖片上傳完成前無法送出。

## 五、設定方式

於 `apps/admin/.env.local` 設定以下變數（值取自 Cloudinary Dashboard）：

```
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

## 六、歷史驗證結果

> 以下結果未於本次文件整理重新執行，不代表目前持續通過。

- `apps/admin` 之 `tsc --noEmit`：**通過（exit 0）**。
- `apps/admin` 之 `next build`：**Compiled successfully（exit 0）**，新增 `/api/upload` 路由產出，既有商品 CRUD 路由不受影響。
- 新增依賴：`cloudinary`（安裝於 `apps/admin`）。
