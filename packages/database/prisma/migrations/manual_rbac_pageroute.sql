-- ============================================================
-- 手動遷移：RBAC 角色擴充 + LayoutSection.pageRoute
-- ============================================================
-- 適用情境：開發環境若可使用 `prisma migrate dev`，請優先使用：
--   cd packages/database && npx prisma migrate dev --schema=./schema.prisma --name rbac_and_pageroute
-- 若僅能直接對資料庫執行 SQL（例如雲端託管 DB 無 shadow database 權限），
-- 可直接套用本檔（MySQL 8 語法）。
--
-- 本遷移為「向後相容」：
--   1) Role enum 由 (USER, EDITOR, ADMIN) 擴充為 (USER, SUPER_ADMIN, ADMIN, EDITOR, VENDOR)
--      — 既有資料的 role 值（USER/EDITOR/ADMIN）皆仍合法，不受影響。
--   2) LayoutSection 新增 pageRoute，預設 '/shop'，既有資料自動回填 '/shop'。
-- ============================================================

-- 1. 擴充 User.role 的 enum 定義（MySQL ENUM）
ALTER TABLE `User`
  MODIFY COLUMN `role` ENUM('USER', 'SUPER_ADMIN', 'ADMIN', 'EDITOR', 'VENDOR') NOT NULL DEFAULT 'USER';

-- 2. LayoutSection 新增 pageRoute 欄位（預設 '/shop'，向後相容）
ALTER TABLE `LayoutSection`
  ADD COLUMN `pageRoute` VARCHAR(191) NOT NULL DEFAULT '/shop';

-- 3. 確保既有資料皆已回填 '/shop'（DEFAULT 已處理，此句為保險）
UPDATE `LayoutSection` SET `pageRoute` = '/shop' WHERE `pageRoute` IS NULL OR `pageRoute` = '';

-- 4. 新增 (pageRoute, sortOrder) 複合索引以加速依頁面查詢與排序
CREATE INDEX `LayoutSection_pageRoute_sortOrder_idx` ON `LayoutSection`(`pageRoute`, `sortOrder`);
