-- AlterTable
ALTER TABLE `Order` ADD COLUMN `cvsStoreId` VARCHAR(191) NULL,
    ADD COLUMN `cvsSubType` VARCHAR(191) NULL,
    ADD COLUMN `shippingPaymentNo` VARCHAR(191) NULL,
    ADD COLUMN `shippingTrackingNumber` VARCHAR(191) NULL,
    ADD COLUMN `shippingValidationNo` VARCHAR(191) NULL;
