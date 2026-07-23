import { createHash } from 'node:crypto';
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
const PASSWORD_HASH_ROUNDS = 12;
const DEMO_ORDER_COUNT = 24;

const demoProductImagePathsByCategory: Record<string, string[]> = {
  'demo-home-goods': ['/images/demo/products/home-01.svg', '/images/demo/products/home-02.svg'],
  'demo-daily-foods': ['/images/demo/products/food-01.svg', '/images/demo/products/food-02.svg'],
  'demo-office-supplies': ['/images/demo/products/office-01.svg', '/images/demo/products/office-02.svg'],
  'demo-outdoor-gear': ['/images/demo/products/outdoor-01.svg', '/images/demo/products/outdoor-02.svg'],
  'demo-personal-accessories': ['/images/demo/products/accessory-01.svg', '/images/demo/products/accessory-02.svg'],
};

const demoArticles = [
  {
    slug: 'demo-routine-habits',
    title: '建立規律作息：從每天的小習慣開始',
    summary: '以可持續的小步驟建立穩定作息，讓生活節奏更有秩序。',
    coverImage: '/images/demo/articles/routine.svg',
    publishedAt: new Date('2026-06-10T09:00:00.000Z'),
    content: `<p>規律作息不需要一夜改變，而是從每天可執行的小步驟開始。當生活節奏穩定下來，情緒與專注力也更容易維持。</p><h3>先從固定時間起床</h3><p>設定一個固定的起床時間，讓早晨的第一個習慣有一個清楚的起點。即使只做簡單的拉伸與整理，也能讓日常更有秩序感。</p><h3>建立小型日程提醒</h3><p>把一天中的三個固定點記下來，例如吃飯、整理空間與休息。這些提醒能幫助你把注意力集中在生活節奏，而不是一味追趕每件事。</p><h3>讓節奏變得可持續</h3><p>不必把所有事一次做完，重點是讓每個小習慣都能被重複。長久來看，穩定的節奏比偶爾的衝刺更有幫助。</p><ul><li>每晚固定整理明天的用品</li><li>把起床與洗澡安排在同一段時間</li><li>每週檢視一次自己的作息節奏</li></ul><p>此為作品集 Demo 內容，不構成醫療建議。</p>`,
  },
  {
    slug: 'demo-hydration-routine',
    title: '日常補充水分的簡單方法',
    summary: '把水分補充變成一種輕鬆的日常節奏，避免忽略身體的需求。',
    coverImage: '/images/demo/articles/hydration.svg',
    publishedAt: new Date('2026-06-12T09:00:00.000Z'),
    content: `<p>補充水分不需要特別複雜，重點是把它變成日常中容易被記住的步驟。從一開始就設計得更自然，會更容易持續。</p><h3>把水杯放在常用位置</h3><p>例如桌上、書桌旁或冰箱旁，讓水分補充成為一個視覺提醒。當你習慣性地看到它，就更容易順手喝下去。</p><h3>配合活動建立節奏</h3><p>可以把喝水和日常活動連結，例如在早晨洗漱後、午餐前後或下午休息時補充一口水。這樣能讓行為更自然。</p><h3>用輕量工具提醒自己</h3><p>小型的水壺、提醒鬧鐘、或者一張簡單的喝水清單，都能幫助建立一個容易執行的節奏。</p><ul><li>準備一個容易拿取的水容器</li><li>依照固定時間點補充水分</li><li>把喝水融入日常流程中</li></ul><p>此為作品集 Demo 內容，不構成醫療建議。</p>`,
  },
  {
    slug: 'demo-stretching-breaks',
    title: '久坐生活中的伸展與活動提醒',
    summary: '在忙碌工作間隙加入簡短伸展，讓身體有機會放鬆與活動。',
    coverImage: '/images/demo/articles/stretching.svg',
    publishedAt: new Date('2026-06-14T09:00:00.000Z'),
    content: `<p>久坐容易讓肩頸與下背感到緊繃，這時候只要有幾分鐘的伸展與活動，就能讓身體重新獲得一些能量。</p><h3>用短暫休息打斷長時間坐著</h3><p>每工作一段時間，就站起來走動數步或做幾個簡單動作。這樣不會讓身體長時間維持同一姿勢。</p><h3>選擇簡單且有節奏的動作</h3><p>可以從肩部轉動、腰部伸展、腳踝活動開始，不需要做出很大的變化，重要的是讓身體有感受到活動的機會。</p><h3>把活動變成生活中的一部分</h3><p>把伸展安排在固定時間點，例如午休後、下班前或收工前，能讓這個習慣更容易被記住。</p><ul><li>每小時站起來活動一次</li><li>把伸展動作安排在休息時段</li><li>選擇自己喜歡的節奏與方式</li></ul><p>此為作品集 Demo 內容，不構成醫療建議。</p>`,
  },
  {
    slug: 'demo-balanced-diet',
    title: '均衡飲食的日常實踐方式',
    summary: '從平衡的餐盤與多樣的食物選擇，建立穩定且有彈性的飲食節奏。',
    coverImage: '/images/demo/articles/balanced-diet.svg',
    publishedAt: new Date('2026-06-16T09:00:00.000Z'),
    content: `<p>均衡飲食不是追求完美，而是把多樣的食物安排在日常餐次中。重點是讓選擇變得有意識，並且留有調整空間。</p><h3>讓餐盤有不同的顏色與口感</h3><p>在餐盤中加入不同種類的食物，能讓一餐看起來更豐富，也更容易讓人愉快地吃下去。</p><h3>把食物安排得更有邏輯</h3><p>例如把固定的常備食物放在容易拿取的位置，讓晚餐與午餐的準備過程更順利。</p><h3>用穩定節奏回應不同日子</h3><p>沒有必要為每一天都做出同樣的安排，重點是保有一個基本方向，讓飲食更有彈性。</p><ul><li>準備一份常備的主食與配菜</li><li>在餐次中加入多樣食物</li><li>讓吃飯節奏與忙碌生活相容</li></ul><p>此為作品集 Demo 內容，不構成醫療建議。</p>`,
  },
  {
    slug: 'demo-home-comfort',
    title: '打造更舒適的居家生活環境',
    summary: '從光線、收納與整潔的細節出發，打造一個更容易放鬆的生活空間。',
    coverImage: '/images/demo/articles/home-comfort.svg',
    publishedAt: new Date('2026-06-18T09:00:00.000Z'),
    content: `<p>居家環境會影響人的心情與日常節奏，只要從小地方著手，就能讓空間變得更有溫度與秩序。</p><h3>讓空間保持乾淨與清爽</h3><p>簡單整理物品、保持走道順暢、把常用物品放回原位，這些小動作都能讓室內更舒服。</p><h3>善用光線與色彩</h3><p>自然光與柔和色調能讓空間看起來更輕鬆。即使是小小的布置，也能讓居家畫面更舒適。</p><h3>建立日常收納習慣</h3><p>讓每個區域都有固定的收納位置，能減少雜亂感，也讓使用時更方便。</p><ul><li>每週整理一次常用用品</li><li>用收納盒區分不同類型物品</li><li>保留一塊簡單的休息角落</li></ul><p>此為作品集 Demo 內容，不構成醫療建議。</p>`,
  },
  {
    slug: 'demo-bedtime-routine',
    title: '睡前放鬆：建立自己的晚間節奏',
    summary: '讓睡前時刻變成一個安靜的儀式，為下一天留出更平穩的起點。',
    coverImage: '/images/demo/articles/bedtime.svg',
    publishedAt: new Date('2026-06-20T09:00:00.000Z'),
    content: `<p>睡前的放鬆過程，能讓晚上的節奏慢下來。把這段時間變成一種穩定的儀式，能幫助自己更容易進入休息狀態。</p><h3>設定一個固定的睡前流程</h3><p>例如洗漱、關掉螢幕、整理明天要用的物件，讓大腦知道現在進入休息模式。</p><h3>用輕柔的活動替代刺激</h3><p>閱讀、聽音樂或做簡單的伸展，都可以是一種穩定的轉換方式。重點是讓身體逐步放慢。</p><h3>讓晚間節奏有一點可預期性</h3><p>當晚間流程有固定順序時，會比較不容易被各種干擾打斷，整個生活節奏也會更穩定。</p><ul><li>保留一小段無裝置的時間</li><li>為睡前準備一個固定流程</li><li>讓晚間節奏與早晨起床連動</li></ul><p>此為作品集 Demo 內容，不構成醫療建議。</p>`,
  },
];

const demoLayoutSections = [
  {
    id: createDeterministicUuid('demo-layout-home-hero'),
    title: '首頁主視覺',
    type: 'HERO_BANNER',
    pageRoute: '/',
    sortOrder: 0,
    isActive: true,
    items: [
      { id: createDeterministicUuid('demo-layout-home-hero-item-1'), title: '探索當季生活選物', imageUrl: '/images/demo/layouts/home-hero-01.svg', linkUrl: '/shop', sortOrder: 0, isActive: true },
      { id: createDeterministicUuid('demo-layout-home-hero-item-2'), title: '閱讀健康生活提案', imageUrl: '/images/demo/layouts/home-hero-02.svg', linkUrl: '/articles', sortOrder: 10, isActive: true },
    ],
  },
  {
    id: createDeterministicUuid('demo-layout-home-icon-nav'),
    title: '快速探索',
    type: 'ICON_NAVIGATION',
    pageRoute: '/',
    sortOrder: 10,
    isActive: true,
    items: [
      { id: createDeterministicUuid('demo-layout-home-icon-item-1'), title: '居家選物', imageUrl: '/images/demo/layouts/category-home.svg', linkUrl: '/shop', sortOrder: 0, isActive: true },
      { id: createDeterministicUuid('demo-layout-home-icon-item-2'), title: '日常食品', imageUrl: '/images/demo/layouts/category-food.svg', linkUrl: '/shop', sortOrder: 10, isActive: true },
      { id: createDeterministicUuid('demo-layout-home-icon-item-3'), title: '辦公用品', imageUrl: '/images/demo/layouts/category-office.svg', linkUrl: '/shop', sortOrder: 20, isActive: true },
      { id: createDeterministicUuid('demo-layout-home-icon-item-4'), title: '戶外用品', imageUrl: '/images/demo/layouts/category-outdoor.svg', linkUrl: '/shop', sortOrder: 30, isActive: true },
      { id: createDeterministicUuid('demo-layout-home-icon-item-5'), title: '個人配件', imageUrl: '/images/demo/layouts/category-accessory.svg', linkUrl: '/shop', sortOrder: 40, isActive: true },
    ],
  },
  {
    id: createDeterministicUuid('demo-layout-home-theme'),
    title: '本週精選',
    type: 'THEME_REC',
    pageRoute: '/',
    sortOrder: 20,
    isActive: true,
    items: [
      { id: createDeterministicUuid('demo-layout-home-theme-item-1'), title: '柔光桌面收納盒', imageUrl: '/images/demo/products/home-01.svg', linkUrl: '/shop/demo-product-001', sortOrder: 0, isActive: true },
      { id: createDeterministicUuid('demo-layout-home-theme-item-2'), title: '果香氣泡飲', imageUrl: '/images/demo/products/food-02.svg', linkUrl: '/shop/demo-product-006', sortOrder: 10, isActive: true },
      { id: createDeterministicUuid('demo-layout-home-theme-item-3'), title: '模組化桌面筆座', imageUrl: '/images/demo/products/office-02.svg', linkUrl: '/shop/demo-product-010', sortOrder: 20, isActive: true },
      { id: createDeterministicUuid('demo-layout-home-theme-item-4'), title: '輕量戶外隨行杯', imageUrl: '/images/demo/products/outdoor-02.svg', linkUrl: '/shop/demo-product-016', sortOrder: 30, isActive: true },
    ],
  },
  {
    id: createDeterministicUuid('demo-layout-home-category'),
    title: '居家生活推薦',
    type: 'CATEGORY_FLOOR',
    pageRoute: '/',
    sortOrder: 30,
    isActive: true,
    items: [
      { id: createDeterministicUuid('demo-layout-home-category-item-1'), title: '居家日常', imageUrl: '/images/demo/layouts/lifestyle.svg', linkUrl: '/shop', sortOrder: 0, isActive: true },
      { id: createDeterministicUuid('demo-layout-home-category-item-2'), title: '生活提案', imageUrl: '/images/demo/layouts/category-home.svg', linkUrl: '/articles', sortOrder: 10, isActive: true },
      { id: createDeterministicUuid('demo-layout-home-category-item-3'), title: '精選好物', imageUrl: '/images/demo/layouts/home-promo.svg', linkUrl: '/shop', sortOrder: 20, isActive: true },
      { id: createDeterministicUuid('demo-layout-home-category-item-4'), title: '探索更多', imageUrl: '/images/demo/layouts/category-food.svg', linkUrl: '/shop', sortOrder: 30, isActive: true },
    ],
  },
  {
    id: createDeterministicUuid('demo-layout-home-image-text'),
    title: '生活提案',
    type: 'IMAGE_WITH_TEXT',
    pageRoute: '/',
    sortOrder: 40,
    isActive: true,
    items: [
      { id: createDeterministicUuid('demo-layout-home-image-text-item-1'), title: '居家舒適提案', imageUrl: '/images/demo/layouts/lifestyle.svg', linkUrl: '/articles/demo-home-comfort', sortOrder: 0, isActive: true },
      { id: createDeterministicUuid('demo-layout-home-image-text-item-2'), title: '作息節奏提案', imageUrl: '/images/demo/layouts/home-promo.svg', linkUrl: '/articles/demo-routine-habits', sortOrder: 10, isActive: true },
    ],
  },
  {
    id: createDeterministicUuid('demo-layout-home-promo'),
    title: 'Demo 限時企劃',
    type: 'PROMO_BANNER',
    pageRoute: '/',
    sortOrder: 50,
    isActive: true,
    items: [
      { id: createDeterministicUuid('demo-layout-home-promo-item-1'), title: '本週生活提案', imageUrl: '/images/demo/layouts/home-promo.svg', linkUrl: '/shop', sortOrder: 0, isActive: true },
    ],
  },
  {
    id: createDeterministicUuid('demo-layout-shop-hero'),
    title: '商城主視覺',
    type: 'HERO_BANNER',
    pageRoute: '/shop',
    sortOrder: 0,
    isActive: true,
    items: [
      { id: createDeterministicUuid('demo-layout-shop-hero-item-1'), title: '探索完整選物清單', imageUrl: '/images/demo/layouts/shop-hero-01.svg', linkUrl: '/shop', sortOrder: 0, isActive: true },
      { id: createDeterministicUuid('demo-layout-shop-hero-item-2'), title: '查看健康生活主題', imageUrl: '/images/demo/layouts/shop-hero-02.svg', linkUrl: '/articles', sortOrder: 10, isActive: true },
    ],
  },
  {
    id: createDeterministicUuid('demo-layout-shop-icon-nav'),
    title: '商品分類',
    type: 'ICON_NAVIGATION',
    pageRoute: '/shop',
    sortOrder: 10,
    isActive: true,
    items: [
      { id: createDeterministicUuid('demo-layout-shop-icon-item-1'), title: '居家選物', imageUrl: '/images/demo/layouts/category-home.svg', linkUrl: '/shop', sortOrder: 0, isActive: true },
      { id: createDeterministicUuid('demo-layout-shop-icon-item-2'), title: '日常食品', imageUrl: '/images/demo/layouts/category-food.svg', linkUrl: '/shop', sortOrder: 10, isActive: true },
      { id: createDeterministicUuid('demo-layout-shop-icon-item-3'), title: '辦公用品', imageUrl: '/images/demo/layouts/category-office.svg', linkUrl: '/shop', sortOrder: 20, isActive: true },
      { id: createDeterministicUuid('demo-layout-shop-icon-item-4'), title: '戶外用品', imageUrl: '/images/demo/layouts/category-outdoor.svg', linkUrl: '/shop', sortOrder: 30, isActive: true },
      { id: createDeterministicUuid('demo-layout-shop-icon-item-5'), title: '個人配件', imageUrl: '/images/demo/layouts/category-accessory.svg', linkUrl: '/shop', sortOrder: 40, isActive: true },
    ],
  },
  {
    id: createDeterministicUuid('demo-layout-shop-sales'),
    title: '人氣排行',
    type: 'SALES_RANKING',
    pageRoute: '/shop',
    sortOrder: 20,
    isActive: true,
    items: [
      { id: createDeterministicUuid('demo-layout-shop-sales-item-1'), title: '柔光桌面收納盒', imageUrl: '/images/demo/products/home-01.svg', linkUrl: '/shop/demo-product-001', sortOrder: 0, isActive: true },
      { id: createDeterministicUuid('demo-layout-shop-sales-item-2'), title: '便攜露營餐具組', imageUrl: '/images/demo/products/outdoor-01.svg', linkUrl: '/shop/demo-product-013', sortOrder: 10, isActive: true },
      { id: createDeterministicUuid('demo-layout-shop-sales-item-3'), title: '果香氣泡飲', imageUrl: '/images/demo/products/food-02.svg', linkUrl: '/shop/demo-product-006', sortOrder: 20, isActive: true },
      { id: createDeterministicUuid('demo-layout-shop-sales-item-4'), title: '簡約織帶卡套', imageUrl: '/images/demo/products/accessory-01.svg', linkUrl: '/shop/demo-product-017', sortOrder: 30, isActive: true },
      { id: createDeterministicUuid('demo-layout-shop-sales-item-5'), title: '霧面文件收納夾', imageUrl: '/images/demo/products/office-01.svg', linkUrl: '/shop/demo-product-009', sortOrder: 40, isActive: true },
    ],
  },
  {
    id: createDeterministicUuid('demo-layout-shop-theme'),
    title: '精選商品',
    type: 'THEME_REC',
    pageRoute: '/shop',
    sortOrder: 30,
    isActive: true,
    items: [
      { id: createDeterministicUuid('demo-layout-shop-theme-item-1'), title: '幾何隔熱杯墊組', imageUrl: '/images/demo/products/home-02.svg', linkUrl: '/shop/demo-product-002', sortOrder: 0, isActive: true },
      { id: createDeterministicUuid('demo-layout-shop-theme-item-2'), title: '純色居家擦拭布', imageUrl: '/images/demo/products/home-02.svg', linkUrl: '/shop/demo-product-004', sortOrder: 10, isActive: true },
      { id: createDeterministicUuid('demo-layout-shop-theme-item-3'), title: '輕量隨身記事本', imageUrl: '/images/demo/products/office-02.svg', linkUrl: '/shop/demo-product-012', sortOrder: 20, isActive: true },
      { id: createDeterministicUuid('demo-layout-shop-theme-item-4'), title: '柔韌隨身鑰匙圈', imageUrl: '/images/demo/products/accessory-02.svg', linkUrl: '/shop/demo-product-018', sortOrder: 30, isActive: true },
    ],
  },
  {
    id: createDeterministicUuid('demo-layout-shop-category'),
    title: '戶外生活推薦',
    type: 'CATEGORY_FLOOR',
    pageRoute: '/shop',
    sortOrder: 40,
    isActive: true,
    items: [
      { id: createDeterministicUuid('demo-layout-shop-category-item-1'), title: '戶外露營', imageUrl: '/images/demo/layouts/category-outdoor.svg', linkUrl: '/shop', sortOrder: 0, isActive: true },
      { id: createDeterministicUuid('demo-layout-shop-category-item-2'), title: '生活提案', imageUrl: '/images/demo/layouts/lifestyle.svg', linkUrl: '/articles', sortOrder: 10, isActive: true },
      { id: createDeterministicUuid('demo-layout-shop-category-item-3'), title: '居家選物', imageUrl: '/images/demo/layouts/category-home.svg', linkUrl: '/shop', sortOrder: 20, isActive: true },
      { id: createDeterministicUuid('demo-layout-shop-category-item-4'), title: '配件收藏', imageUrl: '/images/demo/layouts/category-accessory.svg', linkUrl: '/shop', sortOrder: 30, isActive: true },
    ],
  },
  {
    id: createDeterministicUuid('demo-layout-shop-promo'),
    title: '商城 Demo 活動',
    type: 'PROMO_BANNER',
    pageRoute: '/shop',
    sortOrder: 50,
    isActive: true,
    items: [
      { id: createDeterministicUuid('demo-layout-shop-promo-item-1'), title: '商城限時活動', imageUrl: '/images/demo/layouts/shop-promo.svg', linkUrl: '/shop', sortOrder: 0, isActive: true },
    ],
  },
];

function createDeterministicUuid(seed: string): string {
  const hash = createHash('sha256').update(seed).digest('hex');
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

const demoUsers = [
  {
    email: 'demo.admin@example.com',
    name: 'Demo 最高權限管理員',
    role: Role.SUPER_ADMIN,
  },
  { email: 'demo.vendor01@example.com', name: 'Demo 供應商 01', role: Role.VENDOR },
  { email: 'demo.vendor02@example.com', name: 'Demo 供應商 02', role: Role.VENDOR },
  { email: 'demo.member01@example.com', name: 'Demo 會員 01', role: Role.USER },
  { email: 'demo.member02@example.com', name: 'Demo 會員 02', role: Role.USER },
  { email: 'demo.member03@example.com', name: 'Demo 會員 03', role: Role.USER },
] as const;

const demoCustomers = Array.from({ length: 12 }, (_, index) => {
  const sequence = String(index + 1).padStart(2, '0');

  return {
    id: createDeterministicUuid(`demo-customer-${sequence}`),
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
    slug: string;
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

    const categoryImagePaths = demoProductImagePathsByCategory[category.slug] ?? demoProductImagePathsByCategory['demo-home-goods'];
    const productImagePath = categoryImagePaths[Math.floor(index / DEMO_PRODUCT_COUNT_PER_CATEGORY) % categoryImagePaths.length] ?? '/images/demo/products/home-01.svg';
    const productData = {
      name: demoProductNames[index],
      slug,
      description: 'DEMO 商品：此名稱、規格與價格皆為虛構資料，僅供作品集功能展示。',
      price: demoPrices[index],
      stock: 100 + index * 5,
      coverImage: productImagePath,
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
      slug: savedProduct.slug,
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

  const demoAdminUserId = demoUserIds.get('demo.admin@example.com');
  const demoMemberEmails = demoUsers
    .filter((user) => user.role === Role.USER)
    .map((user) => user.email);

  if (!demoAdminUserId) {
    throw new Error('找不到 Demo 管理員使用者。');
  }

  const articleCategoryId = categoryIds.get(demoCategories[0].slug);
  if (!articleCategoryId) {
    throw new Error('找不到 Demo 文章分類。');
  }

  for (const article of demoArticles) {
    const articleData = {
      title: article.title,
      slug: article.slug,
      content: article.content,
      summary: article.summary,
      coverImage: article.coverImage,
      authorId: demoAdminUserId,
      categoryId: articleCategoryId,
      status: PublishStatus.PUBLISHED,
      viewCount: 180 + demoArticles.indexOf(article) * 20,
      publishedAt: article.publishedAt,
      deletedAt: null,
    };

    const savedArticle = await prisma.article.upsert({
      where: { slug: article.slug },
      update: articleData,
      create: {
        ...articleData,
      },
    });

    const recommendedProductIndexes = [0, 2, 7 + demoArticles.indexOf(article) % 3];
    for (const [index, productIndex] of recommendedProductIndexes.entries()) {
      const product = savedDemoProducts[productIndex % savedDemoProducts.length];
      if (!product) continue;

      await prisma.articleProductRecommendation.upsert({
        where: {
          articleId_productId: {
            articleId: savedArticle.id,
            productId: product.id,
          },
        },
        update: { sortOrder: index },
        create: {
          articleId: savedArticle.id,
          productId: product.id,
          sortOrder: index,
        },
      });
    }
  }

  for (const section of demoLayoutSections) {
    const savedSection = await prisma.layoutSection.upsert({
      where: { id: section.id },
      update: {
        title: section.title,
        type: section.type,
        pageRoute: section.pageRoute,
        sortOrder: section.sortOrder,
        isActive: section.isActive,
      },
      create: {
        id: section.id,
        title: section.title,
        type: section.type,
        pageRoute: section.pageRoute,
        sortOrder: section.sortOrder,
        isActive: section.isActive,
      },
    });

    for (const item of section.items) {
      await prisma.layoutItem.upsert({
        where: { id: item.id },
        update: {
          sectionId: savedSection.id,
          title: item.title,
          imageUrl: item.imageUrl,
          linkUrl: item.linkUrl,
          sortOrder: item.sortOrder,
          isActive: item.isActive,
        },
        create: {
          id: item.id,
          sectionId: savedSection.id,
          title: item.title,
          imageUrl: item.imageUrl,
          linkUrl: item.linkUrl,
          sortOrder: item.sortOrder,
          isActive: item.isActive,
        },
      });
    }
  }

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

  const articleCount = await prisma.article.count({ where: { slug: { startsWith: 'demo-' } } });
  const layoutSectionCount = await prisma.layoutSection.count({
    where: { id: { in: demoLayoutSections.map((section) => section.id) } },
  });
  const layoutItemCount = await prisma.layoutItem.count({
    where: { id: { in: demoLayoutSections.flatMap((section) => section.items.map((item) => item.id)) } },
  });

  console.log(
    `✅ Demo 資料建立完成：${demoCategories.length} 個分類、${demoProductNames.length} 個商品、` +
      `${articleCount} 篇文章、${demoUsers.length} 名使用者、${demoCustomers.length} 名客戶、${DEMO_ORDER_COUNT} 筆訂單、` +
      `${layoutSectionCount} 個行銷版位、${layoutItemCount} 個版位項目。`,
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
