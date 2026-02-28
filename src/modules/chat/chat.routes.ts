import { FastifyPluginAsync } from 'fastify'
import { handleChatConnection } from '../../ws/gateway'
import { SERVER_EVENTS } from '../../ws/events'
import { fetchSessionHistory } from '../../ws/handlers/message.handler'
import { HttpError, httpError } from '../../plugins/error-handler'
import { getAuthUser } from '../auth/auth.guard'

const chatRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/ws', { websocket: true }, (socket, request) => {
    try {
      const authUser = getAuthUser(request, { allowQueryToken: true })
      handleChatConnection(fastify, socket, request, authUser)
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

    const scopePrefix = `${authUser.userId}:`

    if (!sessionId.startsWith(scopePrefix)) {
      throw httpError(403, 'Not allowed to access this session history')
    }

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
