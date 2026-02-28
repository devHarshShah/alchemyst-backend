import fp from 'fastify-plugin'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient
  }
}

export default fp(async (fastify) => {
  const adapter = new PrismaPg({ connectionString: fastify.config.DATABASE_URL })
  const prisma = new PrismaClient({ adapter })

  await prisma.$connect()

  fastify.decorate('prisma', prisma)

  fastify.addHook('onClose', async () => {
    await prisma.$disconnect()
  })
})
