# 會員管理 (User Management) 模組 — 交付說明

> 本文件保留模組演進背景；目前權限與帳號邊界以程式碼為準。下方歷史驗證結果不代表目前持續通過。

本模組為「快樂之音」B2B 營運後台（`apps/admin`）新增完整的會員管理 CRUD，嚴格沿用既有商品模組的 UI/UX 設計語言與技術堆疊（React Hook Form + zodResolver + DataTable + 行內快速編輯）。

## 一、資安與權限

會員管理與系統帳號管理是兩個不同邊界：

- `/users` 管理前台一般會員，資料範圍限定為 `role === 'USER'`，不在此處變更角色。
- `/system-users` 管理 `ADMIN`、`EDITOR`、`VENDOR` 等系統帳號，僅 `SUPER_ADMIN` 可操作。
- `SUPER_ADMIN` 不由一般會員或系統帳號表單建立，也不應由這些介面降級或覆寫。

## 二、後端 API

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| `GET` | `/api/users` | 一般會員列表，限定 `USER` 且不回傳 `passwordHash` |
| `POST` | `/api/users` | 新增一般會員，角色固定為 `USER` |
| `GET` | `/api/users/[id]` | 讀取單筆一般會員 |
| `PUT` | `/api/users/[id]` | 更新一般會員可編輯資料，不提供系統角色升降 |
| `PATCH` | `/api/users/[id]` | 僅更新目前程式白名單允許的會員欄位，不得變更角色 |
| `DELETE` | `/api/users/[id]` | 軟刪除一般會員；實際限制以 route handler 為準 |

所有寫入皆於 server 端以 Zod 驗證（`CreateUserSchema` / `UpdateUserSchema` / `InlineUserPatchSchema`），並對 Prisma `P2002` 唯一鍵衝突做競態保險。

## 三、前端

- **`/users` 列表頁**：呈現一般會員資料與狀態，不提供角色切換。
- **`/users/new` 與 `/users/[id]`**：建立或編輯的帳號維持 `USER` 角色。
- **`/system-users`**：系統帳號管理入口，與一般會員管理分離，且僅供 `SUPER_ADMIN` 使用。
- Email 重複時，前端以 Toast 顯示「此 Email 已被使用」。
- Sidebar 於「營運管理」群組新增「會員管理」導覽項目。

## 四、Schema 對齊

目前 `Role` 包含 `USER`、`SUPER_ADMIN`、`ADMIN`、`EDITOR`、`VENDOR`。一般會員介面只處理 `USER`；系統角色由受 `SUPER_ADMIN` 保護的獨立介面處理。`UserStatus` 與密碼欄位的實際限制以目前 schema 和 route handler 為準。

## 五、歷史驗證結果

> 以下結果記錄當時交付狀態，未於本次文件整理重新執行，不代表目前 build 或 typecheck 保證。

- `apps/admin` 之 `tsc --noEmit`：**通過（exit 0）**
- `apps/admin` 之 `next build`：**Compiled successfully（exit 0）**，新路由 `/users`、`/users/new`、`/users/[id]`、`/api/users`、`/api/users/[id]` 全數產出
- 既有商品 / 訂單 / 文章模組不受影響
