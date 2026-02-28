import { FastifyInstance } from 'fastify'
import { GeminiAiStreamService } from './ai-stream.service'
import { SERVER_EVENTS } from '../ws/events'
import { fetchSessionHistory, saveMessage } from '../ws/handlers/message.handler'
import { sendEventToSession } from '../ws/registry'

const lastActivityKey = (sessionId: string) => `chat:idle:last:${sessionId}`
const promptedKey = (sessionId: string) => `chat:idle:prompted:${sessionId}`

export class IdleService {
  constructor(
    private readonly fastify: FastifyInstance,
    private readonly idleMs: number,
    private readonly gemini: GeminiAiStreamService
  ) {}

  async markActivity(sessionId: string) {
    if (!sessionId.trim()) {
      return
    }

    const now = Date.now().toString()

    await this.fastify.redis.set(lastActivityKey(sessionId), now)
    await this.fastify.redis.del(promptedKey(sessionId))
  }

  async checkAndSendPrompt(sessionId: string) {
    if (!sessionId.trim()) {
      return
    }

    const lastActivityRaw = await this.fastify.redis.get(lastActivityKey(sessionId))

    if (!lastActivityRaw) {
      await this.fastify.redis.set(lastActivityKey(sessionId), Date.now().toString())
      return
    }

    const lastActivity = Number(lastActivityRaw)

    if (Number.isNaN(lastActivity)) {
      await this.fastify.redis.set(lastActivityKey(sessionId), Date.now().toString())
      return
    }

    if (Date.now() - lastActivity < this.idleMs) {
      return
    }

    const lock = await this.fastify.redis.set(promptedKey(sessionId), '1', 'EX', 3600, 'NX')

    if (lock !== 'OK') {
      return
    }

    const history = await fetchSessionHistory(this.fastify, sessionId)
    const promptText = await this.gemini.generateIdlePrompt(history)
    const promptMessage = await saveMessage(this.fastify, sessionId, 'assistant', promptText)

    sendEventToSession(sessionId, {
      type: SERVER_EVENTS.ASSISTANT_MESSAGE,
      sessionId,
      text: promptMessage.content,
      timestamp: promptMessage.timestamp,
    })
  }
}
