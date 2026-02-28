import { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import envPlugin from './plugins/env'
import errorHandlerPlugin from './plugins/error-handler'
import corsPlugin from './plugins/cors'
import websocketPlugin from './plugins/websocket'
import redisPlugin from './plugins/redis'
import prismaPlugin from './plugins/db'
import swaggerPlugin from './plugins/swagger'
import authRoutes from './modules/auth/auth.routes'
import chatRoutes from './modules/chat/chat.routes'

const app: FastifyPluginAsync = async (fastify) => {
  await fastify.register(envPlugin)
  await fastify.register(errorHandlerPlugin)
  await fastify.register(corsPlugin)
  await fastify.register(websocketPlugin)
  await fastify.register(redisPlugin)
  await fastify.register(prismaPlugin)
  await fastify.register(swaggerPlugin)

  await fastify.register(authRoutes, { prefix: '/auth' })
  await fastify.register(chatRoutes, { prefix: '/chat' })

  fastify.get('/health', async () => ({ status: 'ok' }))
}

export default fp(app)
export const options = {
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss',
        ignore: 'pid,hostname',
      },
    },
  },
}
