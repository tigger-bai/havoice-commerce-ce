-- Add optional product barcode separate from SKU.
-- MySQL unique indexes allow multiple NULL values, preserving old products without barcodes.
ALTER TABLE `Product` ADD COLUMN `barcode` VARCHAR(191) NULL;

CREATE UNIQUE INDEX `Product_barcode_key` ON `Product`(`barcode`);
