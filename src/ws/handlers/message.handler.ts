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

export async function listUserSessionIds(
  fastify: FastifyInstance,
  userId: string
): Promise<string[]> {
  const normalizedUserId = userId.trim()

  if (!normalizedUserId) {
    throw httpError(400, 'userId is required')
  }

  const pattern = chatHistoryKey(`${normalizedUserId}:*`)
  let cursor = '0'
  const keys: string[] = []

  do {
    const [nextCursor, batch] = await fastify.redis.scan(cursor, 'MATCH', pattern, 'COUNT', '100')
    cursor = nextCursor
    keys.push(...batch)
  } while (cursor !== '0')

  return keys
    .map((key) => key.replace('chat:history:', ''))
    .filter((sessionId) => sessionId.startsWith(`${normalizedUserId}:`))
}

export async function fetchLastMessage(
  fastify: FastifyInstance,
  sessionId: string
): Promise<StoredMessage | null> {
  const raw = await fastify.redis.lindex(chatHistoryKey(sessionId), -1)

  if (!raw) {
    return null
  }

  return JSON.parse(raw) as StoredMessage
}

export async function fetchMessageCount(fastify: FastifyInstance, sessionId: string): Promise<number> {
  return fastify.redis.llen(chatHistoryKey(sessionId))
}
