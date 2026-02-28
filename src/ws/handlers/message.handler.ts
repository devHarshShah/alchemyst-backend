import { randomUUID } from 'node:crypto'
import { FastifyInstance } from 'fastify'
import { httpError } from '../../plugins/error-handler'

const chatHistoryKey = (sessionId: string) => `chat:history:${sessionId}`

export type StoredMessageRole = 'user' | 'assistant' | 'system'

export type StoredMessage = {
  id: string
  role: StoredMessageRole
  content: string
  timestamp: string
  interrupted?: boolean
}

export function createSessionId(userId: string): string {
  return `${userId}:${randomUUID()}`
}

export function assertSessionOwnership(userId: string, sessionId: string) {
  if (!sessionId.startsWith(`${userId}:`)) {
    throw httpError(403, 'Not allowed to access this session')
  }
}

export async function saveMessage(
  fastify: FastifyInstance,
  sessionId: string,
  role: StoredMessageRole,
  content: string,
  options?: { interrupted?: boolean }
): Promise<StoredMessage> {
  const text = content.trim()

  if (!sessionId.trim()) {
    throw httpError(400, 'sessionId is required')
  }

  if (!text) {
    throw httpError(400, 'content is required')
  }

  const message: StoredMessage = {
    id: randomUUID(),
    role,
    content: text,
    timestamp: new Date().toISOString(),
    interrupted: options?.interrupted,
  }

  await fastify.redis.rpush(chatHistoryKey(sessionId), JSON.stringify(message))

  return message
}

export async function fetchSessionHistory(
  fastify: FastifyInstance,
  sessionId: string
): Promise<StoredMessage[]> {
  if (!sessionId.trim()) {
    throw httpError(400, 'sessionId is required')
  }

  const rawMessages = await fastify.redis.lrange(chatHistoryKey(sessionId), 0, -1)

  return rawMessages.map((item) => JSON.parse(item) as StoredMessage)
}
