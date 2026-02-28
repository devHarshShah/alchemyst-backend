import { FastifyInstance } from 'fastify'
import { UserMessageClientEvent } from '../../types/ws-events'
import { httpError } from '../../plugins/error-handler'

const chatHistoryKey = (sessionId: string) => `chat:history:${sessionId}`

type StoredMessage = {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

export async function handleUserMessage(
  fastify: FastifyInstance,
  sessionId: string,
  payload: UserMessageClientEvent
) {
  const text = payload.text?.trim()

  if (!text) {
    throw httpError(400, 'text is required')
  }

  const userMessage: StoredMessage = {
    role: 'user',
    content: text,
    timestamp: new Date().toISOString(),
  }

  const assistantMessage: StoredMessage = {
    role: 'assistant',
    content: `Echo: ${text}`,
    timestamp: new Date().toISOString(),
  }

  await fastify.redis.rpush(chatHistoryKey(sessionId), JSON.stringify(userMessage))
  await fastify.redis.rpush(chatHistoryKey(sessionId), JSON.stringify(assistantMessage))

  return {
    text,
    assistantReply: assistantMessage.content,
  }
}

export async function fetchSessionHistory(fastify: FastifyInstance, sessionId: string) {
  if (!sessionId.trim()) {
    throw httpError(400, 'sessionId is required')
  }

  const rawMessages = await fastify.redis.lrange(chatHistoryKey(sessionId), 0, -1)

  const messages = rawMessages.map((item) => JSON.parse(item) as StoredMessage)

  return messages
}
