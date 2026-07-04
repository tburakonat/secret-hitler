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

# ─── Runtime image ──────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=installer /app .

EXPOSE 3000

CMD ["sh", "-c", "pnpm --filter backend exec prisma migrate deploy && node apps/backend/dist/index.js"]
