import {
  OrderSource,
  OrderStatus,
  PaymentStatus,
  PrismaClient,
  PublishStatus,
  Role,
  UserStatus,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const demoCategories = [
  { name: 'Demo 居家選物', slug: 'demo-home-goods' },
  { name: 'Demo 日常食品', slug: 'demo-daily-foods' },
  { name: 'Demo 辦公用品', slug: 'demo-office-supplies' },
  { name: 'Demo 戶外用品', slug: 'demo-outdoor-gear' },
  { name: 'Demo 個人配件', slug: 'demo-personal-accessories' },
] as const;

const demoProductNames = [
  'Demo 柔光桌面收納盒',
  'Demo 幾何隔熱杯墊組',
  'Demo 輕巧折疊置物籃',
  'Demo 純色居家擦拭布',
  'Demo 香草風味脆餅',
  'Demo 果香氣泡飲',
  'Demo 穀物能量小方塊',
  'Demo 午後綜合茶包',
  'Demo 霧面文件收納夾',
  'Demo 模組化桌面筆座',
  'Demo 方格便條紙組',
  'Demo 輕量隨身記事本',
  'Demo 防潑水野餐墊',
  'Demo 便攜露營餐具組',
  'Demo 多用途收納繩',
  'Demo 輕量戶外隨行杯',
  'Demo 簡約織帶卡套',
  'Demo 柔韌隨身鑰匙圈',
  'Demo 輕巧旅行收納袋',
  'Demo 純色日常小包',
] as const;

const demoPrices = [
  320, 180, 450, 160,
  220, 75, 260, 190,
  280, 240, 120, 210,
  690, 380, 150, 420,
  260, 180, 350, 520,
] as const;

const DEMO_PRODUCT_COUNT_PER_CATEGORY = 4;
const DEMO_COVER_IMAGE = '/images/demo-product-placeholder.svg';
const PASSWORD_HASH_ROUNDS = 12;
const DEMO_ORDER_COUNT = 24;

const demoUsers = [
  { email: 'demo.admin@example.com', name: 'Demo 管理員', role: Role.ADMIN },
  { email: 'demo.vendor01@example.com', name: 'Demo 供應商 01', role: Role.VENDOR },
  { email: 'demo.vendor02@example.com', name: 'Demo 供應商 02', role: Role.VENDOR },
  { email: 'demo.member01@example.com', name: 'Demo 會員 01', role: Role.USER },
  { email: 'demo.member02@example.com', name: 'Demo 會員 02', role: Role.USER },
  { email: 'demo.member03@example.com', name: 'Demo 會員 03', role: Role.USER },
] as const;

const demoCustomers = Array.from({ length: 12 }, (_, index) => {
  const sequence = String(index + 1).padStart(2, '0');

  return {
    id: `DEMO-CUSTOMER-${sequence}`,
    name: `Demo 客戶 ${sequence}`,
    email: `demo.customer${sequence}@example.com`,
    address: `示範市樣本區測試路 DEMO ${index + 1} 號`,
  };
});

const demoOrderStates = [
  { status: OrderStatus.PENDING, paymentStatus: PaymentStatus.UNPAID },
  { status: OrderStatus.PAID, paymentStatus: PaymentStatus.PAID },
  { status: OrderStatus.SHIPPED, paymentStatus: PaymentStatus.PAID },
  { status: OrderStatus.DELIVERED, paymentStatus: PaymentStatus.PAID },
  { status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.UNPAID },
  { status: OrderStatus.REFUNDED, paymentStatus: PaymentStatus.REFUNDED },
] as const;

function getDemoUserPassword(): string {
  const password = process.env.DEMO_USER_PASSWORD;

  if (!password) {
    throw new Error('缺少 DEMO_USER_PASSWORD，Demo seed 已停止。請先設定本機環境變數。');
  }

  if (
    password.length < 8 ||
    password.length > 72 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password)
  ) {
    throw new Error('DEMO_USER_PASSWORD 不符合專案密碼規則，Demo seed 已停止。');
  }

  return password;
}

async function main() {
  const demoUserPassword = getDemoUserPassword();
  const passwordHash = await bcrypt.hash(demoUserPassword, PASSWORD_HASH_ROUNDS);

  console.log('⏳ 開始建立公開作品集 Demo 資料...');

  const categoryIds = new Map<string, string>();
  const savedDemoProducts: Array<{
    id: string;
    name: string;
    price: number;
    vendorId: string | null;
  }> = [];
  const demoUserIds = new Map<string, string>();
  const demoCustomerIds = new Map<string, string>();

  for (const category of demoCategories) {
    const savedCategory = await prisma.category.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        description: 'DEMO 分類：僅供公開作品集展示，內容完全虛構。',
      },
      create: {
        name: category.name,
        slug: category.slug,
        description: 'DEMO 分類：僅供公開作品集展示，內容完全虛構。',
      },
    });

    categoryIds.set(category.slug, savedCategory.id);
  }

  for (let index = 0; index < demoProductNames.length; index += 1) {
    const sequence = String(index + 1).padStart(3, '0');
    const sku = `DEMO-SKU-${sequence}`;
    const slug = `demo-product-${sequence}`;
    const category = demoCategories[Math.floor(index / DEMO_PRODUCT_COUNT_PER_CATEGORY)];
    const categoryId = categoryIds.get(category.slug);

    if (!categoryId) {
      throw new Error(`找不到 Demo 分類：${category.slug}`);
    }

    const productData = {
      name: demoProductNames[index],
      slug,
      description: 'DEMO 商品：此名稱、規格與價格皆為虛構資料，僅供作品集功能展示。',
      price: demoPrices[index],
      stock: 100 + index * 5,
      coverImage: DEMO_COVER_IMAGE,
      images: null,
      categoryId,
      vendorId: null,
      status: PublishStatus.PUBLISHED,
      deletedAt: null,
    };

    const savedProduct = await prisma.product.upsert({
      where: { sku },
      update: productData,
      create: {
        ...productData,
        sku,
      },
    });

    savedDemoProducts.push({
      id: savedProduct.id,
      name: savedProduct.name,
      price: Number(savedProduct.price),
      vendorId: savedProduct.vendorId,
    });
  }

  for (const user of demoUsers) {
    const userData = {
      name: user.name,
      passwordHash,
      role: user.role,
      status: UserStatus.ACTIVE,
      phone: null,
      address: null,
      remark: 'DEMO 使用者：僅供本機作品集功能展示。',
      deletedAt: null,
    };

    const savedUser = await prisma.user.upsert({
      where: { email: user.email },
      update: userData,
      create: {
        ...userData,
        email: user.email,
      },
    });

    demoUserIds.set(user.email, savedUser.id);
  }

  for (const customer of demoCustomers) {
    const customerData = {
      name: customer.name,
      email: customer.email,
      phone: null,
      address: customer.address,
      source: 'DEMO_SEED',
      remark: 'DEMO 客戶：所有識別資料均為虛構。',
      deletedAt: null,
    };

    const savedCustomer = await prisma.customer.upsert({
      where: { id: customer.id },
      update: customerData,
      create: {
        ...customerData,
        id: customer.id,
      },
    });

    demoCustomerIds.set(customer.id, savedCustomer.id);
  }

  const demoMemberEmails = demoUsers
    .filter((user) => user.role === Role.USER)
    .map((user) => user.email);

  for (let orderIndex = 0; orderIndex < DEMO_ORDER_COUNT; orderIndex += 1) {
    const orderSequence = String(orderIndex + 1).padStart(4, '0');
    const orderNumber = `DEMO-ORDER-${orderSequence}`;
    const customer = demoCustomers[orderIndex % demoCustomers.length];
    const customerId = demoCustomerIds.get(customer.id);
    const memberEmail = demoMemberEmails[orderIndex % demoMemberEmails.length];
    const userId = demoUserIds.get(memberEmail);
    const orderState = demoOrderStates[orderIndex % demoOrderStates.length];
    const itemCount = (orderIndex % 4) + 1;
    const items = Array.from({ length: itemCount }, (_, itemIndex) => {
      const productIndex = (orderIndex * 3 + itemIndex) % savedDemoProducts.length;
      const product = savedDemoProducts[productIndex];

      return {
        id: `${orderNumber}-ITEM-${String(itemIndex + 1).padStart(2, '0')}`,
        product,
        quantity: (itemIndex % 3) + 1,
      };
    });
    const totalAmount = items.reduce(
      (sum, item) => sum + item.product.price * item.quantity,
      0,
    );

    if (!customerId || !userId) {
      throw new Error(`找不到 ${orderNumber} 所需的 Demo 關聯 ID。`);
    }

    await prisma.$transaction(async (transaction) => {
      const orderData = {
        userId,
        customerId,
        source: OrderSource.WEB_CHECKOUT,
        totalAmount,
        shippingAddress: `示範市樣本區測試路 DEMO ${orderIndex + 1} 號`,
        billingAddress: null,
        status: orderState.status,
        paymentStatus: orderState.paymentStatus,
        paymentMethod: orderState.paymentStatus === PaymentStatus.UNPAID ? null : 'DEMO_PAYMENT',
        shippingMethod: null,
        trackingNumber: null,
        notes: 'DEMO 訂單：所有訂單、收件與金額資料均為虛構。',
        deletedAt: null,
      };

      const savedOrder = await transaction.order.upsert({
        where: { orderNumber },
        update: orderData,
        create: {
          ...orderData,
          orderNumber,
        },
      });

      for (const item of items) {
        const itemData = {
          orderId: savedOrder.id,
          productId: item.product.id,
          productName: item.product.name,
          productPrice: item.product.price,
          vendorId: item.product.vendorId,
          quantity: item.quantity,
        };

        await transaction.orderItem.upsert({
          where: { id: item.id },
          update: itemData,
          create: {
            ...itemData,
            id: item.id,
          },
        });
      }

      await transaction.orderRecipient.upsert({
        where: { orderId: savedOrder.id },
        update: {
          name: `Demo 收件人 ${String(orderIndex + 1).padStart(2, '0')}`,
          phone: `DEMO-PHONE-${orderSequence}`,
          email: `demo.recipient${String(orderIndex + 1).padStart(2, '0')}@example.com`,
          address: `示範市樣本區測試路 DEMO ${orderIndex + 1} 號`,
          city: '示範市',
          district: '樣本區',
          postalCode: null,
          country: 'DEMO',
        },
        create: {
          orderId: savedOrder.id,
          name: `Demo 收件人 ${String(orderIndex + 1).padStart(2, '0')}`,
          phone: `DEMO-PHONE-${orderSequence}`,
          email: `demo.recipient${String(orderIndex + 1).padStart(2, '0')}@example.com`,
          address: `示範市樣本區測試路 DEMO ${orderIndex + 1} 號`,
          city: '示範市',
          district: '樣本區',
          postalCode: null,
          country: 'DEMO',
        },
      });
    });
  }

  console.log(
    `✅ Demo 資料建立完成：${demoCategories.length} 個分類、${demoProductNames.length} 個商品、` +
      `${demoUsers.length} 名使用者、${demoCustomers.length} 名客戶、${DEMO_ORDER_COUNT} 筆訂單。`,
  );
}

main()
  .catch((error) => {
    console.error('❌ Demo 商品 seed 執行失敗：', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
