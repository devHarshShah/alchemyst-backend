import { FastifyPluginAsync } from 'fastify'
import { getAuthUser } from '../auth/auth.guard'
import { HttpError, httpError } from '../../plugins/error-handler'
import { GeminiAiStreamService } from '../../services/ai-stream.service'
import { DEFAULT_GREETING_MESSAGE } from '../../services/ai-prompts'
import { IdleService } from '../../services/idle.service'
import { handleChatConnection } from '../../ws/gateway'
import { SERVER_EVENTS } from '../../ws/events'
import {
  assertSessionOwnership,
  createSessionId,
  fetchLastMessage,
  fetchMessageCount,
  fetchSessionHistory,
  listUserSessionIds,
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
      let greeting = DEFAULT_GREETING_MESSAGE
      try {
        greeting = await gemini.generateSessionGreeting()
      } catch (error) {
        const aiFailure = httpError(
          502,
          'AI failed to generate the opening message. Sent a fallback greeting instead.'
        )
        fastify.log.error({ err: error, sessionId }, 'Opening greeting generation failed')
        sendEventToSession(sessionId, {
          type: SERVER_EVENTS.ERROR,
          statusCode: aiFailure.statusCode,
          reason: aiFailure.message,
        })
      }

      firstAssistantMessage = await saveMessage(fastify, sessionId, 'assistant', greeting)
      await idleService.markAssistantActivity(sessionId)

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

  fastify.get('/sessions', async (request, reply) => {
    const authUser = getAuthUser(request)
    const sessionIds = await listUserSessionIds(fastify, authUser.userId)

    const sessions = await Promise.all(
      sessionIds.map(async (sessionId) => {
        const [lastMessage, messageCount, sessionEnded] = await Promise.all([
          fetchLastMessage(fastify, sessionId),
          fetchMessageCount(fastify, sessionId),
          idleService.isSessionEnded(sessionId),
        ])

        return {
          sessionId,
          sessionEnded,
          messageCount,
          updatedAt: lastMessage?.timestamp ?? null,
          lastMessage: lastMessage
            ? {
                role: lastMessage.role,
                content: lastMessage.content,
                timestamp: lastMessage.timestamp,
                interrupted: lastMessage.interrupted ?? false,
              }
            : null,
        }
      })
    )

    sessions.sort((a, b) => {
      const left = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const right = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return right - left
    })

    return reply.status(200).send({
      statusCode: 200,
      message: 'Sessions fetched',
      data: {
        userId: authUser.userId,
        sessions,
      },
    })
  })
}

export default chatRoutes
