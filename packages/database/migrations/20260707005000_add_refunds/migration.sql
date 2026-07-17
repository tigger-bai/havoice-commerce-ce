-- CreateTable
CREATE TABLE `refunds` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `paymentTransactionId` VARCHAR(191) NULL,
    `provider` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `reason` TEXT NULL,
    `requestedByActorType` VARCHAR(191) NOT NULL,
    `requestedByActorId` VARCHAR(191) NULL,
    `providerRefundNo` VARCHAR(191) NULL,
    `rawResponse` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `refunds_orderId_idx`(`orderId`),
    INDEX `refunds_paymentTransactionId_idx`(`paymentTransactionId`),
    INDEX `refunds_provider_idx`(`provider`),
    INDEX `refunds_status_idx`(`status`),
    INDEX `refunds_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refund_events` (
    `id` VARCHAR(191) NOT NULL,
    `refundId` VARCHAR(191) NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `eventType` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NULL,
    `message` TEXT NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `refund_events_refundId_idx`(`refundId`),
    INDEX `refund_events_orderId_idx`(`orderId`),
    INDEX `refund_events_eventType_idx`(`eventType`),
    INDEX `refund_events_status_idx`(`status`),
    INDEX `refund_events_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `refunds` ADD CONSTRAINT `refunds_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refund_events` ADD CONSTRAINT `refund_events_refundId_fkey` FOREIGN KEY (`refundId`) REFERENCES `refunds`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refund_events` ADD CONSTRAINT `refund_events_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
