# Alchemyst Backend - Real-Time AI Chat (Fastify + WebSocket)

Backend service for a real-time AI chat application that simulates a live phone-call style conversation.

This project is built for an internship assignment and includes:
- JWT auth (signup/login/me)
- Protected WebSocket chat
- Streaming AI responses (Gemini)
- User interruption handling
- Conversation history persistence
- Idle detection and auto session ending
- Dockerized deployment (app + Postgres + Redis)

## Tech Stack

- Node.js + TypeScript
- Fastify
- `@fastify/websocket`
- Redis (`ioredis`) for session/chat state
- PostgreSQL + Prisma
- Gemini API (`@google/genai`)
- Docker + Docker Compose

## Assignment Feature Coverage

- Real-time chat using WebSockets: implemented (`/chat/ws`)
- User interruption support: implemented (`assistant_interrupted` flow)
- Full conversation history tracking: implemented (Redis list per session + HTTP fetch)
- Idle user detection with follow-up: implemented (configurable timeout)
- First message from AI: implemented (session start + WS join bootstrap)
- Slow streaming to simulate call: implemented (`CHUNK_DELAY_MS`)
- Session end after repeated idle prompts: implemented (3 idle prompts -> ended)

## Architecture

```mermaid
flowchart LR
  FE[Frontend] -->|HTTP JWT| API[Fastify API]
  FE -->|WebSocket token| WS[WS Gateway]

  API --> AUTH[Auth Module]
  API --> CHAT[Chat Module]
  WS --> CHAT

  CHAT --> AI[Gemini AI Service]
  CHAT --> IDLE[Idle Service]
  CHAT --> CTX[Context/History Handler]

  AUTH --> PG[(PostgreSQL)]
  CHAT --> REDIS[(Redis)]
```

## Project Structure

```text
src/
  app.ts
  modules/
    auth/
      auth.routes.ts
      auth.controller.ts
      auth.service.ts
      auth.guard.ts
      auth.schema.ts
    chat/
      chat.routes.ts
  plugins/
    env.ts
    error-handler.ts
    cors.ts
    websocket.ts
    redis.ts
    db.ts
    swagger.ts
  services/
    ai-prompts.ts
    ai-stream.service.ts
    idle.service.ts
  ws/
    gateway.ts
    events.ts
    registry.ts
    handlers/
      message.handler.ts
      ping.handler.ts
```

## Environment Variables

Use a single `.env` file.

Copy template:

```bash
cp .env.example .env
```

Current `.env.example`:

```env
PORT=4000
HOST=0.0.0.0
IDLE_SECONDS=60
CHUNK_DELAY_MS=35
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_chat
REDIS_URL=redis://localhost:6380
JWT_SECRET=replace_with_strong_secret
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
CORS_ORIGIN=http://localhost:3000
SWAGGER_ENABLED=true
NODE_ENV=development
```

Required:
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `GEMINI_API_KEY`

## Run Locally (without Docker)

Prerequisites:
- Node.js 20+
- pnpm
- Postgres running
- Redis running

Steps:

```bash
pnpm install
pnpm prisma generate
pnpm build:ts
pnpm dev
```

Health check:

```bash
curl http://localhost:4000/health
```

Swagger (if enabled):
- `http://localhost:4000/docs`

## Run with Docker (recommended for reviewers)

```bash
cp .env.example .env
# fill GEMINI_API_KEY and JWT_SECRET
docker compose up -d --build
```

Services:
- App: `http://localhost:4000`
- Postgres host port: `5450`
- Redis host port: `6380`

Logs:

```bash
docker compose logs -f app
```

Stop:

```bash
docker compose down
```

Reset DB volume:

```bash
docker compose down -v
```

## API Endpoints

Base URL: `http://localhost:4000`

### Auth

- `POST /auth/signup`
- `POST /auth/login`
- `GET /auth/me` (Bearer token)

Example signup:

```bash
curl -X POST http://localhost:4000/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"Password123"}'
```

### Chat (HTTP)

All routes require `Authorization: Bearer <token>`.

- `POST /chat/session/start`
  - Creates/loads a session
  - Ensures first assistant message exists
- `GET /chat/sessions`
  - Returns all user sessions for sidebar/history
- `GET /chat/history/:sessionId`
  - Returns full message history for a session

Example start session:

```bash
curl -X POST http://localhost:4000/chat/session/start \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## WebSocket Contract

Endpoint:
- `GET /chat/ws?token=<jwt>`

Connection is JWT-protected.

### Client -> Server events

- `join`

```json
{ "type": "join", "sessionId": "<optional-session-id>" }
```

- `user_message`

```json
{ "type": "user_message", "text": "Hello" }
```

- `ping`

```json
{ "type": "ping" }
```

### Server -> Client events

- `connected`
- `joined`
- `history`
- `session_started`
- `message_received`
- `assistant_stream_start`
- `assistant_stream_chunk`
- `assistant_stream_end`
- `assistant_interrupted`
- `assistant_message`
- `session_ended`
- `pong`
- `error`

Typical flow:
1. Client connects
2. Client sends `join`
3. Server sends history or generates first AI greeting
4. Client sends `user_message`
5. Server streams assistant chunks
6. If interrupted, server emits `assistant_interrupted` and stores partial with `[Interrupted]`

## Error Format

Global error handler returns:

```json
{
  "statusCode": 400,
  "reason": "Readable error message"
}
```

WS errors follow:

```json
{
  "type": "error",
  "statusCode": 502,
  "reason": "AI failed to generate ..."
}
```

## AI/Prompt Behavior

Prompt templates are centralized in:
- `src/services/ai-prompts.ts`

This file controls:
- Greeting prompt
- Chat response prompt
- Idle follow-up prompt
- Session end prompt
- Fallback messages

If AI generation fails for greeting/idle/end prompts:
- Backend sends a fallback assistant message
- Backend also emits a clean `error` event

## Reviewer Quick Test Script

1. `POST /auth/signup`
2. `POST /auth/login` and copy JWT
3. `POST /chat/session/start` with JWT
4. Connect WS at `/chat/ws?token=<jwt>`
5. Send `join`
6. Send `user_message`
7. Verify chunk streaming events
8. Send another `user_message` quickly to force interruption
9. Wait `IDLE_SECONDS` to observe idle follow-up and eventual `session_ended`
10. Call `GET /chat/sessions` and `GET /chat/history/:sessionId`

## Notes

- This repo is intentionally simple and readable for internship evaluation.
- Infra is modular (plugins/services/modules) so each concern can be reviewed independently.
