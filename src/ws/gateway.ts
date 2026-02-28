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
import { IdleService } from '../services/idle.service'
import {
  assertSessionOwnership,
  createSessionId,
  fetchSessionHistory,
  saveMessage,
} from './handlers/message.handler'
import { setTimeout as sleep } from 'node:timers/promises'

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
  connectionId: string,
  sessionId: string
) {
  let history = await fetchSessionHistory(fastify, sessionId)

  if (history.length === 0) {
    const greeting = await gemini.generateSessionGreeting()
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
  let activeStreamId = 0

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

  void idleService.markActivity(defaultSessionId)

  const idleCheckInterval = setInterval(() => {
    const sessionId = getConnectionSession(connectionId) || defaultSessionId
    void idleService.checkAndSendPrompt(sessionId)
  }, 10000)

  socket.on('message', async (rawData: RawData) => {
    try {
      const event = parseClientEvent(rawData)

      if (event.type === CLIENT_EVENTS.JOIN) {
        const sessionId = event.sessionId?.trim() || defaultSessionId
        assertSessionOwnership(authUser.userId, sessionId)
        setConnectionSession(connectionId, sessionId)
        await idleService.markActivity(sessionId)

        sendEvent(connectionId, {
          type: SERVER_EVENTS.JOINED,
          sessionId,
        })

        await sendSessionHistory(fastify, gemini, connectionId, sessionId)
        return
      }

      if (event.type === CLIENT_EVENTS.PING) {
        const sessionId = getConnectionSession(connectionId) || defaultSessionId
        await idleService.markActivity(sessionId)

        sendEvent(connectionId, {
          type: SERVER_EVENTS.PONG,
          ...getPongPayload(),
        })
        return
      }

      const sessionId = getConnectionSession(connectionId) || defaultSessionId
      assertSessionOwnership(authUser.userId, sessionId)
      await idleService.markActivity(sessionId)
      activeStreamId += 1
      const streamId = activeStreamId

      const preHistory = await fetchSessionHistory(fastify, sessionId)

      if (preHistory.length === 0) {
        const greeting = await gemini.generateSessionGreeting()
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
        if (streamId !== activeStreamId) {
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

      if (streamId !== activeStreamId) {
        interrupted = true
      }

      if (interrupted) {
        if (assistantText.trim()) {
          const interruptedContent = `${assistantText.trim()} [Interrupted]`
          const interruptedMessage = await saveMessage(
            fastify,
            sessionId,
            'assistant',
            interruptedContent,
            {
              interrupted: true,
            }
          )

          sendEvent(connectionId, {
            type: SERVER_EVENTS.ASSISTANT_MESSAGE,
            sessionId,
            text: interruptedMessage.content,
            timestamp: interruptedMessage.timestamp,
            interrupted: true,
          })
        }

        sendEvent(connectionId, {
          type: SERVER_EVENTS.ASSISTANT_INTERRUPTED,
          sessionId,
          partialText: assistantText,
        })

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
