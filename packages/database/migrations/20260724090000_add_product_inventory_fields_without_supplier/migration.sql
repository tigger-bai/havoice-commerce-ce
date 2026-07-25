-- Add standalone product inventory-planning fields.
-- Supplier integration is intentionally deferred to a later migration.
ALTER TABLE `Product`
  ADD COLUMN `cost` DECIMAL(10, 2) NULL,
  ADD COLUMN `brand` VARCHAR(191) NULL,
  ADD COLUMN `safetyStock` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `reorderPoint` INTEGER NULL;

CREATE INDEX `Product_brand_idx` ON `Product`(`brand`);
CREATE INDEX `Product_safetyStock_idx` ON `Product`(`safetyStock`);
CREATE INDEX `Product_reorderPoint_idx` ON `Product`(`reorderPoint`);
