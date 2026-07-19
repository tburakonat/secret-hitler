# Deployment & Betrieb

Diese Datei beschreibt, wie die Anwendung aufgebaut ist und wie man sie betreibt — lokal zum Entwickeln und produktiv auf einem Server.

## Architektur-Überblick

Die Anwendung läuft als Docker-Compose-Stack mit vier Services. Nach außen ist **genau ein Port** offen (Default `8080`), alles andere läuft im internen Compose-Netzwerk:

```
                              Browser
                                 │
                                 ▼  http://<host>:8080
                    ┌─────────────────────────┐
                    │   frontend (nginx)      │
                    │   - served React-Build  │
                    │   - Reverse Proxy       │
                    └───────────┬─────────────┘
              /api/*  und  /socket.io/*  (internes Netz)
                                ▼
                    ┌─────────────────────────┐
                    │   backend (Node.js)     │
                    │   Fastify + Socket.io   │
                    │   Start: prisma migrate │
                    │   deploy → Server       │
                    └─────┬─────────────┬─────┘
                          ▼             ▼
                  ┌──────────────┐  ┌──────────────┐
                  │  postgres    │  │  redis       │
                  │  (Lobbies,   │  │  (aktiver    │
                  │  Spieler,    │  │  Spiel-      │
                  │  Historie)   │  │  zustand)    │
                  └──────────────┘  └──────────────┘
                   Volume:            Volume:
                   postgres_data      redis_data
```

**Single-Origin-Prinzip:** Frontend und Backend laufen aus Sicht des Browsers auf derselben Origin. Das nginx im Frontend-Container served den statischen React-Build und proxied zwei Pfade zum Backend:

| Pfad | Ziel | Zweck |
|------|------|-------|
| `/api/` | `backend:3000` | HTTP-Routen (`/api/auth/*`, `/api/lobbies`) |
| `/socket.io/` | `backend:3000` | WebSocket/Polling für alle Echtzeit-Events (mit Upgrade-Headern und 24h-Timeout) |
| alles andere | statische Dateien | SPA mit Fallback auf `index.html` |

Daraus folgt:
- **Das Frontend-Image ist umgebungsunabhängig** — keine Backend-URL wird beim Build eingebacken. Einmal bauen, überall deployen.
- **Kein CORS nötig**, Auth-Cookie ist `SameSite=Lax; HttpOnly` — funktioniert auch ohne HTTPS.
- Das Backend hat **kein Host-Port-Mapping**, `GET /health` ist nur intern erreichbar (Docker-Healthcheck).

**Datenhaltung:**
- **PostgreSQL** (Volume `postgres_data`): persistente Daten — Lobbies, Spieler, abgeschlossene Spiele. Schema via Prisma-Migrationen.
- **Redis** (Volume `redis_data`): aktiver Spielzustand (schnell, TTL 24h). Dank Volume und `--save 60 1` überlebt er Container-Neustarts.

**Identität:** Spielen erfordert einen Account (E-Mail + Passwort + Nickname). Der Login (`POST /api/auth/login` bzw. `/register`) setzt ein `authToken`-Cookie (HttpOnly, 30 Tage), das Reloads und Reconnects übersteht. Socket-Verbindungen ohne gültiges Cookie werden beim Handshake abgelehnt.

## Produktiv-Deployment

Voraussetzungen auf dem Server: Docker mit Compose-Plugin, Git. Sonst nichts.

```bash
git clone <repo-url> && cd secret-hitler
cp .env.example .env
# .env editieren: POSTGRES_PASSWORD und COOKIE_SECRET setzen
docker compose up -d --build
```

Die App ist danach unter `http://<host>:8080` erreichbar. Fehlt eines der Pflicht-Secrets, bricht Compose sofort mit einer klaren Fehlermeldung ab.

### Die `.env`-Variablen

| Variable | Pflicht | Default | Bedeutung |
|----------|---------|---------|-----------|
| `POSTGRES_PASSWORD` | ✅ | – | DB-Passwort. Greift nur bei der **Erstinitialisierung** des Volumes (späteres Ändern: `docker compose down -v` oder `ALTER USER` im Container) |
| `COOKIE_SECRET` | ✅ | – | Secret für `@fastify/cookie`. Generieren: `openssl rand -hex 32` |
| `APP_PORT` | – | `8080` | Der einzige exponierte Port des Stacks |
| `COOKIE_SECURE` | – | `false` | Auf `true` setzen, wenn ein HTTPS-Proxy davor sitzt |
| `POSTGRES_USER` / `POSTGRES_DB` | – | `postgres` / `secret_hitler` | Nur ändern, wenn nötig |

Alle backend-internen Variablen (`DATABASE_URL`, `REDIS_URL`, `PORT`, `NODE_ENV`) setzt die `docker-compose.yml` selbst — sie zeigen auf die Compose-Servicenamen und müssen nicht konfiguriert werden.

### HTTPS

Der Stack terminiert selbst kein TLS. Der einfachste Weg ist ein Reverse Proxy auf dem Host, z.B. Caddy:

```
# Caddyfile
spiel.example.com {
    reverse_proxy localhost:8080
}
```

Danach in der `.env` `COOKIE_SECURE=true` setzen und `docker compose up -d` (Backend startet mit neuer Config). Traefik oder nginx auf dem Host funktionieren genauso — es muss nur `localhost:${APP_PORT}` erreichen.

### Updates einspielen

```bash
git pull
docker compose up -d --build
```

Das Backend führt beim Start automatisch `prisma migrate deploy` aus — Datenbank-Migrationen laufen also ohne manuellen Schritt. Die Volumes bleiben erhalten; laufende Spiele in Redis überleben den Neustart (Clients reconnecten über das Auth-Cookie).

### Betrieb & Diagnose

```bash
docker compose ps                    # Status + Healthchecks aller Services
docker compose logs -f backend      # Backend-Logs (JSON, pino)
docker compose logs backend | grep -i migrat   # Sind Migrationen durchgelaufen?
docker compose restart backend      # Einzelnen Service neu starten
docker compose down                 # Stack stoppen (Volumes bleiben)
docker compose down -v              # ⚠️ Stack stoppen UND alle Daten löschen
```

Alle Services haben Healthchecks und `restart: unless-stopped` — sie kommen nach einem Server-Reboot von selbst wieder hoch. Das Backend startet erst, wenn Postgres und Redis healthy sind; das Frontend erst, wenn das Backend healthy ist.

**Backup:** Postgres-Dump aus dem laufenden Container:

```bash
docker compose exec postgres pg_dump -U postgres secret_hitler > backup.sql
```

### Häufige Probleme

| Symptom | Ursache / Lösung |
|---------|------------------|
| `backend unhealthy`, Logs zeigen `P1000: Authentication failed` | Das `postgres_data`-Volume wurde mit einem anderen Passwort initialisiert als in der `.env` steht. Entweder `.env` anpassen oder Volume wipen (`docker compose down -v`, **löscht Daten**) |
| Compose bricht ab: `Set POSTGRES_PASSWORD in .env` | `.env` fehlt oder Pflichtvariable nicht gesetzt |
| WebSocket verbindet nicht | Sitzt ein eigener Proxy davor? Er muss WebSocket-Upgrades durchlassen (Caddy/Traefik: automatisch; eigenes nginx: `Upgrade`/`Connection`-Header setzen) |
| Cookie wird nicht gesetzt hinter HTTPS-Proxy | `COOKIE_SECURE=true` in `.env` setzen |

## Lokale Entwicklung

Nur die Datenbanken laufen im Container, die Node-Apps auf dem Host (schnelles HMR):

```bash
docker compose up -d postgres redis   # nur die zwei Infrastruktur-Services
pnpm install
pnpm dev                              # Backend (3000) + Frontend (5173) parallel
```

App im Browser: `http://localhost:5173`. Der Vite-Dev-Server proxied `/api` und `/socket.io` zum Backend — dieselbe Same-Origin-Logik wie in Produktion, keine `VITE_BACKEND_URL` nötig. Backend-Konfiguration für den Host-Betrieb liegt in `apps/backend/.env` (Vorlage: `apps/backend/.env.example`).

**Migrationen:** `pnpm dev` führt vor dem Serverstart automatisch `prisma migrate deploy` aus (wie der Container) — die Dev-DB ist damit immer auf dem Stand der committeten Migrationen, auch nach einem frischen Volume oder `git pull`. Nur beim **Ändern des Schemas** braucht es einen manuellen Schritt: `pnpm --filter backend db:migrate` (erzeugt interaktiv eine neue Migrationsdatei und wendet sie an).

Optionale DB-Tools (pgAdmin auf `:5050`, RedisInsight auf `:8001`, nur an localhost gebunden):

```bash
docker compose --profile tools up -d
```

**Mit pgAdmin verbinden:** pgAdmin läuft selbst im Container — als Host beim Registrieren des Servers daher `postgres` (den Compose-Servicenamen) eintragen, **nicht** `localhost`. Port `5432`, User/Passwort aus der `.env`, Datenbank `secret_hitler`. Die Tabellen liegen unter `secret_hitler → Schemas → public → Tables`.

**Kompletten Prod-Stack lokal testen** (z.B. vor einem Release):

```bash
cp .env.example .env   # falls noch nicht vorhanden; Secrets setzen
docker compose up -d --build
# → http://localhost:8080
```

## Sonderfall: getrenntes Deployment (Frontend/Backend auf verschiedenen Origins)

Der Standard ist Single-Origin. Wer Frontend und Backend trotzdem getrennt hosten will (z.B. Vercel + Railway):

1. Frontend mit Backend-URL bauen: `docker build -f apps/frontend/Dockerfile --build-arg VITE_BACKEND_URL=https://api.example.com .` (bzw. `VITE_BACKEND_URL` im Hosting-Provider setzen)
2. Am Backend `CLIENT_ORIGIN=https://app.example.com` setzen (kommasepariert für mehrere Origins)

Damit aktiviert das Backend CORS für diese Origin und stellt das Cookie auf `SameSite=None; Secure` um — **beide Seiten brauchen dann zwingend HTTPS**.

## Container-Details

| Service | Image | Besonderheiten |
|---------|-------|----------------|
| `frontend` | Multi-Stage: `turbo prune` → pnpm-Build → `nginx:1.27-alpine` (~74 MB) | Config: `apps/frontend/nginx.conf` |
| `backend` | Multi-Stage: `turbo prune` → Build → prod-only Runtime auf `node:20-slim` (ohne devDependencies, pnpm, turbo) | `CMD`: `prisma migrate deploy && node dist/index.js` |
| `postgres` | `postgres:16-alpine` | Port nur auf `127.0.0.1` gebunden |
| `redis` | `redis:7-alpine` mit `--save 60 1` | Port nur auf `127.0.0.1` gebunden |

Beide App-Dockerfiles erwarten das **Monorepo-Root als Build-Context** (`docker build -f apps/backend/Dockerfile .`) und nutzen `turbo prune`, damit nur die tatsächlich benötigten Workspace-Pakete im Image landen.
