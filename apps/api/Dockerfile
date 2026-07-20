# syntax=docker/dockerfile:1.7
FROM --platform=linux/amd64 node:20-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/admin/package.json apps/admin/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/database/schema.prisma packages/database/schema.prisma
COPY packages/shared/package.json packages/shared/package.json
COPY packages/eslint-config/package.json packages/eslint-config/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
RUN pnpm --filter @havoice/database db:generate \
 && pnpm --filter @havoice/shared build \
 && pnpm --filter @havoice/database build \
 && pnpm --filter @havoice/api build \
 && pnpm --filter @havoice/api exec esbuild src/server.ts --bundle --platform=node --target=node20 --format=esm --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" --outfile=dist/server.bundle.mjs --external:@prisma/client --external:.prisma/client \
 && pnpm --filter @havoice/api deploy --prod /prod/api \
 && cp packages/database/schema.prisma /prod/api/schema.prisma \
 && cd /prod/api \
 && /app/packages/database/node_modules/.bin/prisma generate --schema schema.prisma \
 && node -e 'const resolved = require.resolve("@prisma/client"); const { PrismaClient } = require("@prisma/client"); const client = new PrismaClient(); console.log(`Prisma runtime client: ${resolved}`); client.$disconnect();' \
 && find node_modules -path '*/.prisma/client/libquery_engine-*' -type f -print -quit | grep -q .

# One-shot Prisma jobs intentionally retain build tooling and source files.
FROM builder AS tools
ENV NODE_ENV=production

FROM base AS runner
ENV NODE_ENV=production
ENV API_PORT=4000
WORKDIR /app
RUN groupadd --system --gid 1001 nodejs \
 && useradd --system --uid 1001 --gid nodejs api
COPY --from=builder --chown=api:nodejs /prod/api/node_modules ./node_modules
COPY --from=builder --chown=api:nodejs /app/apps/api/dist/server.bundle.mjs ./server.mjs
RUN node -e 'const resolved = require.resolve("@prisma/client"); const { PrismaClient } = require("@prisma/client"); const client = new PrismaClient(); console.log(`Runner Prisma client: ${resolved}`); client.$disconnect();' \
 && find node_modules -path '*/.prisma/client/libquery_engine-*' -type f -print -quit | grep -q . \
 && openssl version
USER api
EXPOSE 4000
CMD ["node", "server.mjs"]
