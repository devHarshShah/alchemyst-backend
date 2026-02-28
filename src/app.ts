import { FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import envPlugin from './plugins/env'
import prismaPlugin from './plugins/db'
import swaggerPlugin from './plugins/swagger'
import corsPlugin from './plugins/cors'
import errorHandlerPlugin from './plugins/error-handler'

const app: FastifyPluginAsync = async (fastify) => {
  await fastify.register(envPlugin)
  await fastify.register(errorHandlerPlugin)
  await fastify.register(corsPlugin)
  await fastify.register(prismaPlugin)
  await fastify.register(swaggerPlugin)

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
