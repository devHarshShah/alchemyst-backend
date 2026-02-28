import fp from 'fastify-plugin'
import Redis from 'ioredis'

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis
  }
}

export default fp(async (fastify) => {

  const redis = new Redis(fastify.config.REDIS_URL)

  redis.on('error', (error) => {
    fastify.log.error({ err: error }, 'Redis connection error')
  })

  fastify.decorate('redis', redis)

  fastify.addHook('onClose', async () => {
    await redis.quit()
  })
})
