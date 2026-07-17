// packages/database/src/index.ts
import { PrismaClient } from '@prisma/client';

// 🔴 定義具備軟刪除（Soft Delete）特性的模型白名單
const SOFT_DELETE_MODELS = ['User', 'Article', 'Video', 'Product', 'Order'];

/**
 * 建立並配置具備企業級防護網的 Prisma 實例
 */
const createPrismaExtendedClient = () => {
  const baseClient = new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
  });

  return baseClient.$extends({
    name: 'PrismaSoftDeleteExtension',
    query: {
      $allModels: {
       
        async findMany({ model, args, query }) {
          if (SOFT_DELETE_MODELS.includes(model)) {
            if ((args.where as any)?.deletedAt === undefined) {
              args.where = { ...args.where, deletedAt: null } as any;
            }
          }
          return query(args);
        },

        async findFirst({ model, args, query }) {
          if (SOFT_DELETE_MODELS.includes(model)) {
            if ((args.where as any)?.deletedAt === undefined) {
              args.where = { ...args.where, deletedAt: null } as any;
            }
          }
          return query(args);
        },

        async findUnique({ model, args, query }) {
          if (SOFT_DELETE_MODELS.includes(model)) {
            if ((args.where as any)?.deletedAt === undefined) {
              const { where, ...rest } = args;
              // findUnique 無法查詢非唯一索引，降級為 findFirst
              return (baseClient as any)[model].findFirst({
                where: { ...(where as any), deletedAt: null },
                ...rest,
              });
            }
          }
          return query(args);
        },

        async count({ model, args, query }) {
          if (SOFT_DELETE_MODELS.includes(model)) {
            if ((args.where as any)?.deletedAt === undefined) {
              args.where = { ...args.where, deletedAt: null } as any;
            }
          }
          return query(args);
        },

        // 🟡 寫入動作攔截 (Soft Delete)
        async delete({ model, args }) {
          if (SOFT_DELETE_MODELS.includes(model)) {
            return (baseClient as any)[model].update({
              where: args.where,
              data: { deletedAt: new Date() },
            });
          }
          return (baseClient as any)[model].delete(args);
        },

        async deleteMany({ model, args }) {
          if (SOFT_DELETE_MODELS.includes(model)) {
            return (baseClient as any)[model].updateMany({
              where: args.where,
              data: { deletedAt: new Date() },
            });
          }
          return (baseClient as any)[model].deleteMany(args);
        },
      },
    },
  });
};

type PrismaClientExtended = ReturnType<typeof createPrismaExtendedClient>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientExtended | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaExtendedClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export * from '@prisma/client';