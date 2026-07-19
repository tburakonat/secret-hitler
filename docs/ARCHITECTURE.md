# Architecture

## Monorepo structure

```
secret-hitler/
├── apps/
│   ├── frontend/          # React + Vite
│   └── backend/           # Fastify + Socket.io
├── packages/
│   └── shared/            # Shared TypeScript types and constants
│       ├── types.ts
│       └── constants.ts
├── docker-compose.yml     # Full production stack (also used for dev infra)
├── .env.example           # Template for the deployment .env
├── turbo.json
├── package.json           # pnpm workspace root
└── CLAUDE.md
```

### packages/shared

This package is the contract between frontend and backend. It contains:
- All game-related TypeScript types (`GameState`, `Player`, `Role`, `GamePhase`, `PolicyCard`, etc.)
- Game constants (card counts, player limits, policy counts)
- Socket.io event name constants (to avoid typo bugs)

Both `apps/frontend` and `apps/backend` import from `@secret-hitler/shared`.

## Tech stack

### Frontend (`apps/frontend`)
| Tool | Purpose |
|------|---------|
| React + Vite | UI framework and dev server |
| TypeScript | Type safety |
| Tailwind CSS | Styling |
| shadcn/ui | Accessible UI components (built on Tailwind) |
| Zustand | Client-side state management |
| React Router | Client-side routing |
| i18next | Internationalisation (DE, EN, TR) |
| socket.io-client | WebSocket connection to backend |

### Backend (`apps/backend`)
| Tool | Purpose |
|------|---------|
| Node.js + Fastify | HTTP server |
| TypeScript | Type safety |
| Socket.io | Real-time WebSocket communication |
| Prisma | ORM for PostgreSQL |
| ioredis | Redis client |
| Zod | Runtime validation of all incoming socket payloads |

### Infrastructure
| Tool | Purpose |
|------|---------|
| PostgreSQL | Persistent storage (lobbies, players, finished games) |
| Redis | Active game state (fast, ephemeral, TTL 24h) |
| Docker Compose | Production stack and local dev infrastructure |

## Local development setup

PostgreSQL and Redis run in Docker. The Node.js apps run directly on the host for fast HMR and Claude Code compatibility.

```bash
# Start infrastructure (only the two databases, not the app containers)
docker compose up -d postgres redis

# Install all dependencies
pnpm install

# Run frontend + backend in parallel
pnpm dev
```

The Vite dev server proxies `/api` and `/socket.io` to the backend on port 3000, so no `VITE_BACKEND_URL` is needed. Optional dev tools (pgAdmin, RedisInsight): `docker compose --profile tools up -d`.

## Deployment

The whole stack deploys with Docker Compose on any host (single-origin setup):

```bash
cp .env.example .env    # set POSTGRES_PASSWORD and COOKIE_SECRET
docker compose up -d --build
# App is served on http://<host>:${APP_PORT:-8080}
```

- The frontend container (nginx) serves the static build **and reverse-proxies** `/api` and `/socket.io` to the backend container — the stack exposes exactly one port, and the frontend image is environment-agnostic (no baked-in backend URL).
- The backend runs `prisma migrate deploy` on startup, then boots the server.
- Cookies are `SameSite=Lax`, so the stack works on plain HTTP. For HTTPS, point any TLS reverse proxy (Caddy, Traefik, nginx) at the app port and set `COOKIE_SECURE=true` in `.env`.
- Split deployments (frontend and backend on different origins, e.g. Vercel + Railway) are still possible: build the frontend with the `VITE_BACKEND_URL` build arg and set `CLIENT_ORIGIN` on the backend (enables CORS and switches cookies to `SameSite=None; Secure`, which requires HTTPS).

The frontend communicates with the backend via:
- REST (HTTP) under `/api` for session, auth (`/api/auth/*`), and lobby listing
- WebSocket (Socket.io) under `/socket.io` for all real-time game events

## User accounts (login)

Accounts are optional — guest play works exactly as before. Login is email + password:

- `User` and `AuthSession` tables in PostgreSQL; passwords hashed with argon2id.
- REST endpoints under `/api/auth`: `register`, `login`, `logout`, `me` (rate-limited via `@fastify/rate-limit`).
- Login state lives in its own HTTP-only `authToken` cookie (opaque token, sha256-hashed in the DB, 30-day TTL), independent of the `sessionId` game-identity cookie — logging in or out never affects a running game.
- When a logged-in user creates or joins a lobby, `players.userId` is set (null for guests). Nothing else in the game logic reads auth state.
- Not yet built (schema is prepared): email verification and password reset.
