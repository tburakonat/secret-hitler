# syntax=docker/dockerfile:1

# This Dockerfile expects the build context to be the monorepo root, e.g.:
#   docker build -f apps/backend/Dockerfile .

FROM node:20-slim AS base
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
RUN npm install -g turbo@2.9.18
WORKDIR /app

# ─── Prune the monorepo down to what "backend" actually needs ──────────────
FROM base AS pruner
COPY . .
RUN turbo prune backend --docker

# ─── Install deps and build ─────────────────────────────────────────────────
FROM base AS installer
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
COPY tsconfig.base.json ./tsconfig.base.json
RUN pnpm turbo run build --filter=backend...

# ─── Production dependencies only ───────────────────────────────────────────
FROM base AS prod-deps
COPY --from=pruner /app/out/json/ .
RUN pnpm install --prod --frozen-lockfile

# ─── Runtime image ──────────────────────────────────────────────────────────
FROM node:20-slim AS runner
RUN apt-get update -y \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app .
COPY --from=installer /app/packages/shared/dist ./packages/shared/dist
COPY --from=installer /app/apps/backend/dist ./apps/backend/dist
COPY --from=installer /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=installer /app/apps/backend/prisma.config.ts ./apps/backend/prisma.config.ts

WORKDIR /app/apps/backend
EXPOSE 3000

CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && node dist/index.js"]
