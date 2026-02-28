import { randomUUID } from 'node:crypto'
import { FastifyInstance, FastifyRequest } from 'fastify'
import WebSocket, { RawData } from 'ws'
import { CLIENT_EVENTS, SERVER_EVENTS } from './events'
import { ClientEvent, UserMessageClientEvent } from '../types/ws-events'
import {
  addConnection,
  getConnectionSession,
  removeConnection,
  sendEvent,
  setConnectionSession,
} from './registry'
import { handleUserMessage } from './handlers/message.handler'
import { getPongPayload } from './handlers/ping.handler'
import { HttpError, httpError } from '../plugins/error-handler'
import { AuthPayload } from '../modules/auth/auth.guard'

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

export function handleChatConnection(
  fastify: FastifyInstance,
  socket: WebSocket,
  _request: FastifyRequest,
  authUser: AuthPayload
) {
  const connectionId = randomUUID()
  const defaultSessionId = `${authUser.userId}:${connectionId}`

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

  socket.on('message', async (rawData: RawData) => {
    try {
      const event = parseClientEvent(rawData)

      if (event.type === CLIENT_EVENTS.JOIN) {
        const sessionId = event.sessionId?.trim() || defaultSessionId

        if (!sessionId.startsWith(`${authUser.userId}:`)) {
          throw httpError(403, 'Not allowed to join this session')
        }

        setConnectionSession(connectionId, sessionId)

        sendEvent(connectionId, {
          type: SERVER_EVENTS.JOINED,
          sessionId,
        })
        return
      }

      if (event.type === CLIENT_EVENTS.PING) {
        sendEvent(connectionId, {
          type: SERVER_EVENTS.PONG,
          ...getPongPayload(),
        })
        return
      }

      const sessionId = getConnectionSession(connectionId) || connectionId
      const { text, assistantReply } = await handleUserMessage(
        fastify,
        sessionId,
        event as UserMessageClientEvent
      )

      sendEvent(connectionId, {
        type: SERVER_EVENTS.MESSAGE_RECEIVED,
        sessionId,
        text,
      })

      sendEvent(connectionId, {
        type: SERVER_EVENTS.ASSISTANT_MESSAGE,
        sessionId,
        text: assistantReply,
      })
    } catch (error) {
      sendWsError(connectionId, error)
    }
  })

  socket.on('close', () => {
    removeConnection(connectionId)
  })

  socket.on('error', (error: Error) => {
    fastify.log.error({ err: error }, 'WebSocket connection error')
    sendWsError(connectionId, error)
  })
}
