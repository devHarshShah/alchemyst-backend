import fp from 'fastify-plugin'
import swagger from '@fastify/swagger'
import swaggerUI from '@fastify/swagger-ui'

export default fp(async (fastify) => {
  if (!fastify.config.SWAGGER_ENABLED) {
    return
  }

  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'Realtime AI Chat API',
        version: '1.0.0',
      },
    },
  })

  await fastify.register(swaggerUI, {
    routePrefix: '/docs',
  })
})
