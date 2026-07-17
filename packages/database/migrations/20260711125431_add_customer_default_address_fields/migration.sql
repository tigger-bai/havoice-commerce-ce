-- AlterTable
ALTER TABLE `Customer` ADD COLUMN `address` TEXT NULL,
    ADD COLUMN `city` VARCHAR(191) NULL,
    ADD COLUMN `district` VARCHAR(191) NULL,
    ADD COLUMN `postalCode` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Customer_postalCode_idx` ON `Customer`(`postalCode`);
