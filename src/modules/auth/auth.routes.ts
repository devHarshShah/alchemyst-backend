import { FastifyPluginAsync } from 'fastify'
import { loginController, meController, signupController } from './auth.controller'
import { loginSchema, meSchema, signupSchema } from './auth.schema'

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/signup', { schema: signupSchema }, signupController)
  fastify.post('/login', { schema: loginSchema }, loginController)
  fastify.get('/me', { schema: meSchema }, meController)
}

export default authRoutes
