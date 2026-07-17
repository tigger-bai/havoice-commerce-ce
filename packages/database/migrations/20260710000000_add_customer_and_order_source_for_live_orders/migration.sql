-- CreateTable
CREATE TABLE `Customer` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `lineId` VARCHAR(191) NULL,
    `facebookName` VARCHAR(191) NULL,
    `remark` TEXT NULL,
    `source` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Customer_phone_idx`(`phone`),
    INDEX `Customer_email_idx`(`email`),
    INDEX `Customer_name_idx`(`name`),
    INDEX `Customer_deletedAt_idx`(`deletedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable
ALTER TABLE `Order` DROP FOREIGN KEY `Order_userId_fkey`;

ALTER TABLE `Order`
    ADD COLUMN `customerId` VARCHAR(191) NULL,
    ADD COLUMN `source` ENUM('WEB_CHECKOUT', 'ADMIN_MANUAL', 'LIVE_MANUAL') NOT NULL DEFAULT 'WEB_CHECKOUT',
    MODIFY `userId` VARCHAR(191) NULL;

CREATE INDEX `Order_customerId_idx` ON `Order`(`customerId`);
CREATE INDEX `Order_source_idx` ON `Order`(`source`);

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `Order` ADD CONSTRAINT `Order_customerId_fkey` FOREIGN KEY (`customerId`) REFERENCES `Customer`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
