import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import fp from 'fastify-plugin'

export type AppConfig = {
  NODE_ENV: string
  PORT: number
  DATABASE_URL: string
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

  const port = Number(process.env.PORT ?? '3000')

  if (Number.isNaN(port)) {
    throw new Error('PORT must be a number')
  }

  fastify.decorate('config', {
    NODE_ENV: process.env.NODE_ENV ?? 'development',
    PORT: port,
    DATABASE_URL: process.env.DATABASE_URL,
    CORS_ORIGIN: process.env.CORS_ORIGIN ?? '*',
    SWAGGER_ENABLED: boolFromEnv(process.env.SWAGGER_ENABLED, true),
  })
})
