# syntax=docker/dockerfile:1

# This Dockerfile expects the build context to be the monorepo root, e.g.:
#   docker build -f apps/frontend/Dockerfile .

FROM node:20-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
RUN npm install -g turbo@2.9.18
WORKDIR /app

# ─── Prune the monorepo down to what "frontend" actually needs ─────────────
FROM base AS pruner
COPY . .
RUN turbo prune frontend --docker

# ─── Install deps and build ─────────────────────────────────────────────────
FROM base AS installer
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
COPY tsconfig.base.json ./tsconfig.base.json

# Vite inlines VITE_* variables at build time, so this must be a build arg,
# not a runtime environment variable.
ARG VITE_BACKEND_URL=http://localhost:3000
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL

RUN pnpm turbo run build --filter=frontend...

# ─── Runtime image ──────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runner
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=installer /app/apps/frontend/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
