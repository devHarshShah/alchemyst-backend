import { FastifyInstance } from 'fastify'
import {
  GeminiAiStreamService,
} from './ai-stream.service'
import { DEFAULT_IDLE_FOLLOWUP_MESSAGE, DEFAULT_SESSION_END_MESSAGE } from './ai-prompts'
import { SERVER_EVENTS } from '../ws/events'
import { fetchSessionHistory, saveMessage } from '../ws/handlers/message.handler'
import { sendEventToSession } from '../ws/registry'
import { httpError } from '../plugins/error-handler'

const lastActivityKey = (sessionId: string) => `chat:idle:last:${sessionId}`
const promptCountKey = (sessionId: string) => `chat:idle:count:${sessionId}`
const endedKey = (sessionId: string) => `chat:status:ended:${sessionId}`

export class IdleService {
  private readonly maxIdlePrompts = 3

  constructor(
    private readonly fastify: FastifyInstance,
    private readonly idleMs: number,
    private readonly gemini: GeminiAiStreamService
  ) {}

  async markUserActivity(sessionId: string) {
    if (!sessionId.trim()) {
      return
    }

    const ended = await this.fastify.redis.get(endedKey(sessionId))

    if (ended) {
      return
    }

    const now = Date.now().toString()

    await this.fastify.redis.set(lastActivityKey(sessionId), now)
    await this.fastify.redis.del(promptCountKey(sessionId))
  }

  async markAssistantActivity(sessionId: string) {
    if (!sessionId.trim()) {
      return
    }

    const ended = await this.fastify.redis.get(endedKey(sessionId))

    if (ended) {
      return
    }

    await this.fastify.redis.set(lastActivityKey(sessionId), Date.now().toString())
  }

  async isSessionEnded(sessionId: string): Promise<boolean> {
    if (!sessionId.trim()) {
      return false
    }

    const ended = await this.fastify.redis.get(endedKey(sessionId))
    return ended === '1'
  }

  async assertSessionActive(sessionId: string) {
    if (await this.isSessionEnded(sessionId)) {
      throw httpError(409, 'Session has ended due to inactivity. Start a new session.')
    }
  }

  async checkAndSendPrompt(sessionId: string) {
    if (!sessionId.trim()) {
      return
    }

    if (await this.isSessionEnded(sessionId)) {
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

    const count = await this.fastify.redis.incr(promptCountKey(sessionId))
    const history = await fetchSessionHistory(this.fastify, sessionId)
    let promptText: string

    try {
      promptText = await this.gemini.generateIdlePrompt(history)
    } catch (error) {
      const err = error as { details?: unknown; code?: unknown }
      const aiFailure = httpError(
        502,
        'AI failed to generate an idle follow-up. Sent a fallback message instead.'
      )
      this.fastify.log.error(
        { err: error, providerError: err.details, errorCode: err.code, sessionId },
        'Idle prompt generation failed'
      )
      sendEventToSession(sessionId, {
        type: SERVER_EVENTS.ERROR,
        statusCode: aiFailure.statusCode,
        reason: aiFailure.message,
      })
      promptText = DEFAULT_IDLE_FOLLOWUP_MESSAGE
    }

    const promptMessage = await saveMessage(this.fastify, sessionId, 'assistant', promptText)

    sendEventToSession(sessionId, {
      type: SERVER_EVENTS.ASSISTANT_MESSAGE,
      sessionId,
      text: promptMessage.content,
      timestamp: promptMessage.timestamp,
    })

    await this.markAssistantActivity(sessionId)

    if (count >= this.maxIdlePrompts) {
      await this.fastify.redis.set(endedKey(sessionId), '1')

      let endText = DEFAULT_SESSION_END_MESSAGE
      try {
        const updatedHistory = await fetchSessionHistory(this.fastify, sessionId)
        endText = await this.gemini.generateSessionEndMessage(updatedHistory)
      } catch (error) {
        const err = error as { details?: unknown; code?: unknown }
        const aiFailure = httpError(
          502,
          'AI failed to generate a session-end message. Sent a fallback message instead.'
        )
        this.fastify.log.error(
          { err: error, providerError: err.details, errorCode: err.code, sessionId },
          'Session end message generation failed'
        )
        sendEventToSession(sessionId, {
          type: SERVER_EVENTS.ERROR,
          statusCode: aiFailure.statusCode,
          reason: aiFailure.message,
        })
      }

      const endedMessage = await saveMessage(
        this.fastify,
        sessionId,
        'assistant',
        endText
      )
      await this.markAssistantActivity(sessionId)

      sendEventToSession(sessionId, {
        type: SERVER_EVENTS.ASSISTANT_MESSAGE,
        sessionId,
        text: endedMessage.content,
        timestamp: endedMessage.timestamp,
      })

      sendEventToSession(sessionId, {
        type: SERVER_EVENTS.SESSION_ENDED,
        sessionId,
        reason: 'idle_limit_reached',
      })
    }
  }
}
