-- CreateTable
CREATE TABLE `ProductImage` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `imageUrl` TEXT NOT NULL,
    `publicId` VARCHAR(191) NULL,
    `altText` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isCover` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductDetailBlock` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `body` TEXT NULL,
    `imageUrl` TEXT NULL,
    `imagePublicId` VARCHAR(191) NULL,
    `imageAlt` VARCHAR(191) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isEnabled` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `ProductImage_productId_sortOrder_idx` ON `ProductImage`(`productId`, `sortOrder`);

-- CreateIndex
CREATE INDEX `ProductImage_productId_isCover_idx` ON `ProductImage`(`productId`, `isCover`);

-- CreateIndex
CREATE INDEX `ProductDetailBlock_productId_sortOrder_idx` ON `ProductDetailBlock`(`productId`, `sortOrder`);

-- CreateIndex
CREATE INDEX `ProductDetailBlock_productId_isEnabled_idx` ON `ProductDetailBlock`(`productId`, `isEnabled`);

-- AddForeignKey
ALTER TABLE `ProductImage` ADD CONSTRAINT `ProductImage_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductDetailBlock` ADD CONSTRAINT `ProductDetailBlock_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
