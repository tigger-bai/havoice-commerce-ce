-- ============================================================
-- 手動遷移：多供應商 (Multi-Vendor / B2B2C) 資料隔離
-- ============================================================
-- 適用情境：開發環境若可使用 `prisma migrate dev`，請優先使用：
--   cd packages/database && npx prisma migrate dev --schema=./schema.prisma --name multivendor
-- 若僅能直接對資料庫執行 SQL（雲端託管 DB 無 shadow database 權限），
-- 可直接套用本檔（MySQL 8 語法）。
--
-- 本遷移為「向後相容」且「不破壞既有資料」：
--   1) Product 新增 vendorId（Nullable）+ 外鍵指向 User(id)，ON DELETE SET NULL。
--      既有商品 vendorId 預設為 NULL（視為平台自營），不受影響。
--   2) OrderItem 新增 vendorId（Nullable）快照欄位，供廠商查詢自己的訂單明細。
--      既有訂單明細 vendorId 為 NULL，不受影響；亦可選擇性回填（見最後一段）。
-- ============================================================

-- 1. Product 新增 vendorId 欄位（Nullable）
ALTER TABLE `Product`
  ADD COLUMN `vendorId` VARCHAR(191) NULL;

-- 2. Product.vendorId 外鍵關聯至 User(id)，廠商被刪除時自動設為 NULL（保留商品為平台自營）
ALTER TABLE `Product`
  ADD CONSTRAINT `Product_vendorId_fkey`
  FOREIGN KEY (`vendorId`) REFERENCES `User`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Product.vendorId 索引（加速依廠商過濾的後台列表查詢）
CREATE INDEX `Product_vendorId_idx` ON `Product`(`vendorId`);

-- 4. OrderItem 新增 vendorId 快照欄位（Nullable）
ALTER TABLE `OrderItem`
  ADD COLUMN `vendorId` VARCHAR(191) NULL;

-- 5. OrderItem.vendorId 索引（加速廠商訂單明細查詢）
CREATE INDEX `OrderItem_vendorId_idx` ON `OrderItem`(`vendorId`);

-- 6.（可選）將既有訂單明細回填供應商快照，使歷史訂單也能被廠商查見
--    依各 OrderItem 對應商品當前的 vendorId 回填。
UPDATE `OrderItem` oi
  JOIN `Product` p ON p.`id` = oi.`productId`
  SET oi.`vendorId` = p.`vendorId`
  WHERE oi.`vendorId` IS NULL AND p.`vendorId` IS NOT NULL;
