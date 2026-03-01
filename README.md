# Alchemyst Backend

Fastify backend for realtime AI chat (JWT auth + WebSocket streaming + Redis session state + Prisma/Postgres).

## Prerequisites

1. Docker + Docker Compose
2. Gemini API key

## Local Run (without Docker)

1. Install deps:
```bash
pnpm install
```
2. Create `.env` from `.env.example` and fill required values.
3. Build and run:
```bash
pnpm build:ts
pnpm dev
```

## Deploy/Run with Docker

### 1) Create `.env` once

Use the same `.env` file for both local and Docker:
```bash
cp .env.example .env
```

Set at minimum in `.env`:
- `JWT_SECRET`
- `GEMINI_API_KEY`

### 2) Start full stack

```bash
docker compose up -d --build
```

This starts:
- `app` (Fastify backend)
- `postgres`
- `redis`

### 3) Verify

```bash
curl http://localhost:4000/health
```

## Useful Docker commands

1. Logs:
```bash
docker compose logs -f app
```

2. Rebuild app only:
```bash
docker compose up -d --build app
```

3. Stop stack:
```bash
docker compose down
```

4. Stop and remove volumes (reset db):
```bash
docker compose down -v
```

## Environment Variables (app)

Required:
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `GEMINI_API_KEY`

Optional:
- `GEMINI_MODEL` (default: `gemini-2.5-flash`)
- `PORT` (default: `4000`)
- `HOST` (default: `0.0.0.0`)
- `NODE_ENV` (default: `development` locally, `production` in docker compose)
- `IDLE_SECONDS` (default: `60`)
- `CHUNK_DELAY_MS` (default: `35`)
- `CORS_ORIGIN` (default: `http://localhost:3000`)
- `SWAGGER_ENABLED` (default: `false` in compose)

## Notes

- Container startup runs `prisma migrate deploy` before app launch.
- DB and Redis are included in compose for one-command deployment.
