import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import fp from 'fastify-plugin'

export type AppConfig = {
  NODE_ENV: string
  PORT: number
  IDLE_SECONDS: number
  CHUNK_DELAY_MS: number
  DATABASE_URL: string
  REDIS_URL: string
  JWT_SECRET: string
  GEMINI_API_KEY?: string
  GEMINI_MODEL?: string
  CORS_ORIGIN: string
  SWAGGER_ENABLED: boolean
}

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig
  }
}

function loadDotEnv() {
  const envPath = resolve(process.cwd(), '.env')

  if (!existsSync(envPath)) {
    return
  }

  const content = readFileSync(envPath, 'utf8')

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()

    if (!line || line.startsWith('#')) {
      continue
    }

    const index = line.indexOf('=')

    if (index === -1) {
      continue
    }

    const key = line.slice(0, index).trim()
    const value = line.slice(index + 1).trim()

    if (!process.env[key]) {
      process.env[key] = value
    }
  }
}

function boolFromEnv(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') {
    return fallback
  }

  return value === 'true' || value === '1'
}

export default fp(async (fastify) => {
  loadDotEnv()

  if (!process.env.DATABASE_URL) {
    throw new Error('Missing DATABASE_URL in .env or environment')
  }

  if (!process.env.REDIS_URL) {
    throw new Error('Missing REDIS_URL in .env or environment')
  }

  if (!process.env.JWT_SECRET) {
    throw new Error('Missing JWT_SECRET in .env or environment')
  }

  const port = Number(process.env.PORT ?? '3000')
  const idleSeconds = Number(process.env.IDLE_SECONDS ?? '60')
  const chunkDelayMs = Number(process.env.CHUNK_DELAY_MS ?? '35')

  if (Number.isNaN(port) || port <= 0) {
    throw new Error('PORT must be a positive number')
  }

  if (Number.isNaN(idleSeconds) || idleSeconds <= 0) {
    throw new Error('IDLE_SECONDS must be a positive number')
  }

  if (Number.isNaN(chunkDelayMs) || chunkDelayMs < 0) {
    throw new Error('CHUNK_DELAY_MS must be zero or a positive number')
  }

  fastify.decorate('config', {
    NODE_ENV: process.env.NODE_ENV ?? 'development',
    PORT: port,
    IDLE_SECONDS: idleSeconds,
    CHUNK_DELAY_MS: chunkDelayMs,
    DATABASE_URL: process.env.DATABASE_URL,
    REDIS_URL: process.env.REDIS_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODEL: process.env.GEMINI_MODEL,
    CORS_ORIGIN: process.env.CORS_ORIGIN ?? '*',
    SWAGGER_ENABLED: boolFromEnv(process.env.SWAGGER_ENABLED, true),
  })
})
