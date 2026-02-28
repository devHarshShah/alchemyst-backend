import { FastifyReply, FastifyRequest } from 'fastify'
import { getAuthUser } from './auth.guard'
import { login, signup } from './auth.service'
import { LoginBody, SignupBody } from './auth.schema'
import { httpError } from '../../plugins/error-handler'

export async function signupController(
  request: FastifyRequest<{ Body: SignupBody }>,
  reply: FastifyReply
) {
  const email = request.body.email?.trim()
  const password = request.body.password

  if (!email || !password) {
    throw httpError(400, 'email and password are required')
  }

  const data = await signup(request.server, email, password)

  return reply.status(201).send({
    statusCode: 201,
    message: 'Signup successful',
    data,
  })
}

export async function loginController(
  request: FastifyRequest<{ Body: LoginBody }>,
  reply: FastifyReply
) {
  const email = request.body.email?.trim()
  const password = request.body.password

  if (!email || !password) {
    throw httpError(400, 'email and password are required')
  }

  const data = await login(request.server, email, password)

  return reply.status(200).send({
    statusCode: 200,
    message: 'Login successful',
    data,
  })
}

export async function meController(request: FastifyRequest, reply: FastifyReply) {
  const authUser = getAuthUser(request)
  const user = await request.server.prisma.user.findUnique({
    where: { id: authUser.userId },
    select: { id: true, email: true },
  })

  if (!user) {
    throw httpError(404, 'User not found')
  }

  return reply.status(200).send({
    statusCode: 200,
    message: 'User fetched',
    data: user,
  })
}
