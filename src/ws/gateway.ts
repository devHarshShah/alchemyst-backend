import { FastifyInstance, FastifyRequest } from 'fastify'
import WebSocket, { RawData } from 'ws'
import { CLIENT_EVENTS, SERVER_EVENTS } from './events'
import { ClientEvent } from '../types/ws-events'
import {
  addConnection,
  getConnectionSession,
  removeConnection,
  sendEvent,
  setConnectionSession,
} from './registry'
import { getPongPayload } from './handlers/ping.handler'
import { HttpError, httpError } from '../plugins/error-handler'
import { AuthPayload } from '../modules/auth/auth.guard'
import { GeminiAiStreamService } from '../services/ai-stream.service'
import { DEFAULT_GREETING_MESSAGE } from '../services/ai-prompts'
import { IdleService } from '../services/idle.service'
import {
  assertSessionOwnership,
  createSessionId,
  fetchSessionHistory,
  saveMessage,
} from './handlers/message.handler'
import { setTimeout as sleep } from 'node:timers/promises'

type SessionStreamControl = {
  activeStreamId: number
  activeCompletion?: Promise<void>
  resolveActive?: () => void
}

const sessionStreamControls = new Map<string, SessionStreamControl>()

function getStreamControl(sessionId: string): SessionStreamControl {
  const existing = sessionStreamControls.get(sessionId)

  if (existing) {
    return existing
  }

  const created: SessionStreamControl = { activeStreamId: 0 }
  sessionStreamControls.set(sessionId, created)
  return created
}

async function interruptActiveStream(sessionId: string) {
  const control = getStreamControl(sessionId)

  if (!control.activeCompletion) {
    return
  }

  // Invalidate the current stream id so the running loop exits as interrupted.
  control.activeStreamId += 1

  await Promise.race([control.activeCompletion, sleep(1000)])
}

function beginStream(sessionId: string): { streamId: number; finish: () => void } {
  const control = getStreamControl(sessionId)

  control.activeStreamId += 1
  const streamId = control.activeStreamId

  let finished = false
  control.activeCompletion = new Promise<void>((resolve) => {
    control.resolveActive = resolve
  })

  const finish = () => {
    if (finished) {
      return
    }

    finished = true
    control.resolveActive?.()

    if (control.activeStreamId === streamId) {
      control.activeCompletion = undefined
      control.resolveActive = undefined
    }
  }

  return { streamId, finish }
}

function rawDataToString(rawData: RawData): string {
  if (typeof rawData === 'string') {
    return rawData
  }

  if (rawData instanceof Buffer) {
    return rawData.toString('utf8')
  }

  if (Array.isArray(rawData)) {
    return Buffer.concat(rawData).toString('utf8')
  }

  return Buffer.from(rawData as ArrayBuffer).toString('utf8')
}

function parseClientEvent(rawData: RawData): ClientEvent {
  let payload: Partial<ClientEvent>

  try {
    payload = JSON.parse(rawDataToString(rawData)) as Partial<ClientEvent>
  } catch (_error) {
    throw httpError(400, 'Invalid JSON payload')
  }

  if (!payload.type || typeof payload.type !== 'string') {
    throw httpError(400, 'type is required')
  }

  if (
    payload.type !== CLIENT_EVENTS.JOIN &&
    payload.type !== CLIENT_EVENTS.USER_MESSAGE &&
    payload.type !== CLIENT_EVENTS.PING
  ) {
    throw httpError(400, 'Unsupported event type')
  }

  if (payload.type === CLIENT_EVENTS.USER_MESSAGE) {
    if (typeof payload.text !== 'string') {
      throw httpError(400, 'text must be a string')
    }

    return { type: payload.type, text: payload.text }
  }

  if (payload.type === CLIENT_EVENTS.JOIN) {
    return { type: payload.type, sessionId: payload.sessionId }
  }

  return { type: CLIENT_EVENTS.PING }
}

function sendWsError(connectionId: string, error: unknown) {
  const err = error as { statusCode?: unknown; message?: unknown }
  const statusCode =
    error instanceof HttpError
      ? error.statusCode
      : typeof err.statusCode === 'number'
        ? err.statusCode
        : 500
  const reason = typeof err.message === 'string' ? err.message : 'Something went wrong'

  sendEvent(connectionId, {
    type: SERVER_EVENTS.ERROR,
    statusCode,
    reason,
  })
}

async function sendSessionHistory(
  fastify: FastifyInstance,
  gemini: GeminiAiStreamService,
  idleService: IdleService,
  connectionId: string,
  sessionId: string
) {
  let history = await fetchSessionHistory(fastify, sessionId)

  if (history.length === 0) {
    let greeting = DEFAULT_GREETING_MESSAGE
    try {
      greeting = await gemini.generateSessionGreeting()
    } catch (error) {
      const aiFailure = httpError(
        502,
        'AI failed to generate the opening message. Sent a fallback greeting instead.'
      )
      fastify.log.error({ err: error, sessionId }, 'Opening greeting generation failed')
      sendEvent(connectionId, {
        type: SERVER_EVENTS.ERROR,
        statusCode: aiFailure.statusCode,
        reason: aiFailure.message,
      })
    }

    const assistantMessage = await saveMessage(fastify, sessionId, 'assistant', greeting)

    sendEvent(connectionId, {
      type: SERVER_EVENTS.SESSION_STARTED,
      sessionId,
    })

    sendEvent(connectionId, {
      type: SERVER_EVENTS.ASSISTANT_MESSAGE,
      sessionId,
      text: assistantMessage.content,
      timestamp: assistantMessage.timestamp,
    })

    await idleService.markAssistantActivity(sessionId)

    history = [assistantMessage]
  }

  sendEvent(connectionId, {
    type: SERVER_EVENTS.HISTORY,
    sessionId,
    messages: history,
  })
}

export function handleChatConnection(
  fastify: FastifyInstance,
  socket: WebSocket,
  _request: FastifyRequest,
  authUser: AuthPayload,
  gemini: GeminiAiStreamService,
  idleService: IdleService
) {
  const connectionId = createSessionId(authUser.userId)
  const defaultSessionId = connectionId

  addConnection(connectionId, socket)
  setConnectionSession(connectionId, defaultSessionId)

  sendEvent(connectionId, {
    type: SERVER_EVENTS.CONNECTED,
    connectionId,
  })

  sendEvent(connectionId, {
    type: SERVER_EVENTS.JOINED,
    sessionId: defaultSessionId,
  })

  const idleCheckInterval = setInterval(() => {
    const sessionId = getConnectionSession(connectionId) || defaultSessionId
    void idleService.checkAndSendPrompt(sessionId).catch((error: unknown) => {
      fastify.log.error({ err: error, sessionId }, 'Idle check failed')
    })
  }, 10000)

  socket.on('message', async (rawData: RawData) => {
    try {
      const event = parseClientEvent(rawData)

      if (event.type === CLIENT_EVENTS.JOIN) {
        const sessionId = event.sessionId?.trim() || defaultSessionId
        assertSessionOwnership(authUser.userId, sessionId)
        setConnectionSession(connectionId, sessionId)

        sendEvent(connectionId, {
          type: SERVER_EVENTS.JOINED,
          sessionId,
        })

        await sendSessionHistory(fastify, gemini, idleService, connectionId, sessionId)

        if (await idleService.isSessionEnded(sessionId)) {
          sendEvent(connectionId, {
            type: SERVER_EVENTS.SESSION_ENDED,
            sessionId,
            reason: 'idle_limit_reached',
          })
        }
        return
      }

      if (event.type === CLIENT_EVENTS.PING) {
        sendEvent(connectionId, {
          type: SERVER_EVENTS.PONG,
          ...getPongPayload(),
        })
        return
      }

      const sessionId = getConnectionSession(connectionId) || defaultSessionId
      assertSessionOwnership(authUser.userId, sessionId)
      await idleService.assertSessionActive(sessionId)
      await idleService.markUserActivity(sessionId)
      await interruptActiveStream(sessionId)
      const { streamId, finish } = beginStream(sessionId)

      try {
        const preHistory = await fetchSessionHistory(fastify, sessionId)

        if (preHistory.length === 0) {
          let greeting = DEFAULT_GREETING_MESSAGE
          try {
            greeting = await gemini.generateSessionGreeting()
          } catch (error) {
            const aiFailure = httpError(
              502,
              'AI failed to generate the opening message. Sent a fallback greeting instead.'
            )
            fastify.log.error({ err: error, sessionId }, 'Opening greeting generation failed')
            sendEvent(connectionId, {
              type: SERVER_EVENTS.ERROR,
              statusCode: aiFailure.statusCode,
              reason: aiFailure.message,
            })
          }

          const greetingMessage = await saveMessage(fastify, sessionId, 'assistant', greeting)

          sendEvent(connectionId, {
            type: SERVER_EVENTS.SESSION_STARTED,
            sessionId,
          })

          sendEvent(connectionId, {
            type: SERVER_EVENTS.ASSISTANT_MESSAGE,
            sessionId,
            text: greetingMessage.content,
            timestamp: greetingMessage.timestamp,
          })

          await idleService.markAssistantActivity(sessionId)
        }

        const userMessage = await saveMessage(fastify, sessionId, 'user', event.text)

        sendEvent(connectionId, {
          type: SERVER_EVENTS.MESSAGE_RECEIVED,
          sessionId,
          text: userMessage.content,
        })

        const historyWithUser = await fetchSessionHistory(fastify, sessionId)

        sendEvent(connectionId, {
          type: SERVER_EVENTS.ASSISTANT_STREAM_START,
          sessionId,
        })

        let assistantText = ''
        let interrupted = false

        for await (const chunk of gemini.streamReplyFromHistory(historyWithUser)) {
          if (streamId !== getStreamControl(sessionId).activeStreamId) {
            interrupted = true
            break
          }

          assistantText += chunk

          sendEvent(connectionId, {
            type: SERVER_EVENTS.ASSISTANT_STREAM_CHUNK,
            sessionId,
            chunk,
          })

          if (fastify.config.CHUNK_DELAY_MS > 0) {
            await sleep(fastify.config.CHUNK_DELAY_MS)
          }
        }

        if (streamId !== getStreamControl(sessionId).activeStreamId) {
          interrupted = true
        }

        if (interrupted) {
          if (assistantText.trim()) {
            const interruptedContent = `${assistantText.trim()} [Interrupted]`
            await saveMessage(fastify, sessionId, 'assistant', interruptedContent, {
              interrupted: true,
            })
          }

          sendEvent(connectionId, {
            type: SERVER_EVENTS.ASSISTANT_INTERRUPTED,
            sessionId,
            partialText: assistantText,
          })

          if (assistantText.trim()) {
            await idleService.markAssistantActivity(sessionId)
          }

          return
        }

        const assistantMessage = await saveMessage(fastify, sessionId, 'assistant', assistantText)

        sendEvent(connectionId, {
          type: SERVER_EVENTS.ASSISTANT_STREAM_END,
          sessionId,
          text: assistantMessage.content,
        })

        sendEvent(connectionId, {
          type: SERVER_EVENTS.ASSISTANT_MESSAGE,
          sessionId,
          text: assistantMessage.content,
          timestamp: assistantMessage.timestamp,
        })

        await idleService.markAssistantActivity(sessionId)
      } finally {
        finish()
      }
    } catch (error) {
      sendWsError(connectionId, error)
    }
  })

  socket.on('close', () => {
    clearInterval(idleCheckInterval)
    removeConnection(connectionId)
  })

  socket.on('error', (error: Error) => {
    clearInterval(idleCheckInterval)
    fastify.log.error({ err: error }, 'WebSocket connection error')
    sendWsError(connectionId, error)
  })
}
