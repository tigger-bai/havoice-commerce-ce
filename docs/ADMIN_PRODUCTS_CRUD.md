# 後台商品完整 CRUD 模組 — 交付說明

> 本文件保留實作交付背景；驗證結果為歷史紀錄，現況以程式碼為準。

本次任務在不破壞既有商品列表頁與行內快速編輯 (Inline Quick Edit) 的前提下，為 `apps/admin` 補齊了「新增（上架）商品」與「完整編輯商品」的機制，並建立了對應的後端 API 與前端獨立頁面。所有程式碼均位於 `apps/admin/src/` 之下，未更動 `apps/web`。

## 一、新增與修改的檔案

| 類型 | 路徑 | 說明 |
| --- | --- | --- |
| API（新增） | `apps/admin/src/app/api/categories/route.ts` | `GET` 分類清單，供表單下拉選單使用 |
| API（擴充） | `apps/admin/src/app/api/products/route.ts` | 新增 `POST`（建立商品），保留既有 `GET` 列表 |
| API（擴充） | `apps/admin/src/app/api/products/[id]/route.ts` | 新增 `GET`（單筆預填）、`PUT`（完整更新）、`DELETE`（軟刪除），保留既有 `PATCH`（行內快速編輯） |
| 元件（新增） | `apps/admin/src/components/products/ProductForm.tsx` | 共用商品表單（新增/編輯複用，RHF + zodResolver） |
| 元件（新增） | `apps/admin/src/components/ui/ConfirmDialog.tsx` | 通用確認對話框（刪除二次確認） |
| 頁面（新增） | `apps/admin/src/app/(protected)/products/new/page.tsx` | 新增商品頁 |
| 頁面（新增） | `apps/admin/src/app/(protected)/products/[id]/page.tsx` | 編輯商品頁（GET 預填） |
| 頁面（修改） | `apps/admin/src/app/(protected)/products/page.tsx` | 列表頁增強：新增按鈕、編輯/刪除 Actions、刪除確認對話框 |
| Layout（修改） | `apps/admin/src/app/layout.tsx` | 掛載 `ToastProvider`，使全站 Toast 視覺提示生效 |

## 二、後端 API 設計

目前商品 API 使用商品模組守衛，角色包含 `SUPER_ADMIN`、`ADMIN`、`VENDOR`，並依角色限制資料範圍；停權帳號回 403。各端點細節以目前 route handler 為準。

- **POST /api/products**：以 shared 套件的 `CreateProductSchema` 進行 server-side Zod 驗證。寫入前先將金額正規化至小數兩位（`round2`）、庫存轉為非負整數（`toInt`），避免浮點精度造成 `multipleOf(0.01)` 誤判。並驗證 `categoryId` 外鍵存在、預檢 `slug`/`sku` 唯一性（衝突回 409，並對 Prisma `P2002` 做保底處理）。
- **GET /api/products/[id]**：回傳完整商品供編輯頁預填，金額/庫存經 `toNumber`/`toInt` 安全序列化。
- **PUT /api/products/[id]**：完整表單更新，使用 `UpdateProductSchema`（partial）驗證，與行內快速編輯的 `PATCH` 分開處理，互不干擾。唯一性檢查會排除自身。
- **DELETE /api/products/[id]**：採**軟刪除**（設定 `deletedAt`），與全站既有慣例一致，保留歷史訂單關聯。

## 三、前端表單與互動

- **共用 ProductForm**：使用 React Hook Form + `@hookform/resolvers/zod`，直接複用 shared 的 `CreateProductSchema`，前後端共用同一驗證契約。
- **版面**：左側主資訊區（名稱、slug、描述、封面圖 + 即時預覽），右側設定區（售價、原價、SKU、庫存、分類、狀態），搭配固定於底部的 Action Bar（建立/儲存、取消）。
- **slug 自動生成**：新增模式下，使用者尚未手動修改 slug 時，會依名稱自動生成合法 slug。
- **列表頁**：右上角「+ 新增商品」按鈕；每列 Actions 欄提供「編輯」（導向 `/products/[id]`）與「刪除」（彈出 ConfirmDialog，確認後呼叫 DELETE）。

## 四、防禦性程式設計

- 所有 API 請求皆攔截錯誤並透過 Toast 顯示友善訊息；表單送出失敗時同時以 `ErrorAlert` 呈現。
- 金額與庫存渲染／寫入一律經 `Number(value) || 0`（`safeNumber` / `toNumber`）安全轉換。
- 封面圖預覽於載入失敗時隱藏，不影響版面。
- 刪除進行中停用對話框互動，避免重複提交。

## 五、歷史驗證結果

> 以下結果未於本次文件整理重新執行，不代表目前持續通過。

- `apps/admin` 之 `tsc --noEmit`：**通過（exit 0）**。
- `apps/admin` 之 `next build`：**Compiled successfully（exit 0）**，新路由 `/products/new`、`/products/[id]`、`/api/categories`、`/api/products`（POST）、`/api/products/[id]`（GET/PUT/DELETE）全數產出。
- 新增依賴：`react-hook-form`、`@hookform/resolvers`（安裝於 `apps/admin`）。
