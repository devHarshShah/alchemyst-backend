import { FastifyPluginAsync } from 'fastify'
import { getAuthUser } from '../auth/auth.guard'
import { HttpError, httpError } from '../../plugins/error-handler'
import { GeminiAiStreamService } from '../../services/ai-stream.service'
import { IdleService } from '../../services/idle.service'
import { handleChatConnection } from '../../ws/gateway'
import { SERVER_EVENTS } from '../../ws/events'
import {
  assertSessionOwnership,
  createSessionId,
  fetchSessionHistory,
  saveMessage,
} from '../../ws/handlers/message.handler'
import { sendEventToSession } from '../../ws/registry'

type StartSessionBody = {
  sessionId?: string
}

const chatRoutes: FastifyPluginAsync = async (fastify) => {
  const gemini = new GeminiAiStreamService({
    apiKey: fastify.config.GEMINI_API_KEY,
    model: fastify.config.GEMINI_MODEL,
  })
  const idleService = new IdleService(fastify, fastify.config.IDLE_SECONDS * 1000, gemini)

  fastify.post<{ Body: StartSessionBody }>('/session/start', async (request, reply) => {
    const authUser = getAuthUser(request)
    const requestedSessionId = request.body?.sessionId?.trim()
    const sessionId = requestedSessionId || createSessionId(authUser.userId)

    assertSessionOwnership(authUser.userId, sessionId)
    const isEnded = await idleService.isSessionEnded(sessionId)

    if (!isEnded) {
      await idleService.markUserActivity(sessionId)
    }

    const history = await fetchSessionHistory(fastify, sessionId)
    let firstAssistantMessage = history.find((message) => message.role === 'assistant')

    if (!firstAssistantMessage && !isEnded) {
      const greeting = await gemini.generateSessionGreeting()
      firstAssistantMessage = await saveMessage(fastify, sessionId, 'assistant', greeting)

      sendEventToSession(sessionId, {
        type: SERVER_EVENTS.SESSION_STARTED,
        sessionId,
      })

      sendEventToSession(sessionId, {
        type: SERVER_EVENTS.ASSISTANT_MESSAGE,
        sessionId,
        text: firstAssistantMessage.content,
        timestamp: firstAssistantMessage.timestamp,
      })
    }

    return reply.status(isEnded ? 200 : 201).send({
      statusCode: isEnded ? 200 : 201,
      message: isEnded ? 'Session loaded (ended)' : 'Session started',
      data: {
        sessionId,
        firstMessage: firstAssistantMessage,
        sessionEnded: isEnded,
      },
    })
  })

  fastify.get('/ws', { websocket: true }, (socket, request) => {
    try {
      const authUser = getAuthUser(request, { allowQueryToken: true })
      handleChatConnection(fastify, socket, request, authUser, gemini, idleService)
    } catch (error) {
      const err = error as { message?: unknown; statusCode?: unknown }
      const statusCode =
        error instanceof HttpError
          ? error.statusCode
          : typeof err.statusCode === 'number'
            ? err.statusCode
            : 401
      const reason = typeof err.message === 'string' ? err.message : 'Unauthorized'

      socket.send(
        JSON.stringify({
          type: SERVER_EVENTS.ERROR,
          statusCode,
          reason,
        })
      )
      socket.close(1008, 'Unauthorized')
    }
  })

  fastify.get<{ Params: { sessionId: string } }>('/history/:sessionId', async (request, reply) => {
    const authUser = getAuthUser(request)
    const sessionId = request.params.sessionId?.trim()

    if (!sessionId) {
      throw httpError(400, 'sessionId is required')
    }

    assertSessionOwnership(authUser.userId, sessionId)

    const messages = await fetchSessionHistory(fastify, sessionId)

    return reply.status(200).send({
      statusCode: 200,
      message: 'History fetched',
      data: {
        sessionId,
        messages,
      },
    })
  })
}

export default chatRoutes
