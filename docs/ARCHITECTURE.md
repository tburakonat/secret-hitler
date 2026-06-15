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
├── docker-compose.yml     # Local Redis + PostgreSQL
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
| i18next | Internationalisation (DE, EN to start) |
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
| Docker Compose | Local dev: runs PostgreSQL and Redis |

## Local development setup

PostgreSQL and Redis run in Docker. The Node.js apps run directly on the host for fast HMR and Claude Code compatibility.

```bash
# Start infrastructure
docker compose up -d

# Install all dependencies
pnpm install

# Run frontend + backend in parallel
pnpm dev
```

## Deployment

| Service | Platform |
|---------|---------|
| Frontend | Vercel (free tier, auto-deploy from main branch) |
| Backend | Railway (includes Redis and PostgreSQL plugins) |

The frontend communicates with the backend via:
- REST (HTTP) for lobby creation and joining
- WebSocket (Socket.io) for all real-time game events

## Future login extension

The schema is prepared for adding user accounts later. To add login:
1. Create a `users` table (email, password hash, etc.)
2. Add a nullable `user_id` column to `players` (FK → users.id)
3. When `user_id` is set, identify by `user_id`. When null, fall back to `sessionId`.
No existing logic needs to change.
