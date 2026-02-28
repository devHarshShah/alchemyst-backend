import jwt from 'jsonwebtoken'
import { FastifyRequest } from 'fastify'
import { httpError } from '../../plugins/error-handler'

export type AuthPayload = {
  userId: string
  email: string
}

function verifyToken(token: string, jwtSecret: string): AuthPayload {
  try {
    const payload = jwt.verify(token, jwtSecret) as AuthPayload

    if (!payload.userId || !payload.email) {
      throw httpError(401, 'Invalid token payload')
    }

    return payload
  } catch (_error) {
    throw httpError(401, 'Invalid or expired token')
  }
}

export function getAuthUser(
  request: FastifyRequest,
  options?: { allowQueryToken?: boolean }
): AuthPayload {
  const authorization = request.headers.authorization

  if (authorization?.startsWith('Bearer ')) {
    const token = authorization.slice('Bearer '.length).trim()

    if (!token) {
      throw httpError(401, 'Missing or invalid authorization header')
    }

    return verifyToken(token, request.server.config.JWT_SECRET)
  }

  if (options?.allowQueryToken) {
    const query = request.query as { token?: string }
    const token = query?.token?.trim()

    if (token) {
      return verifyToken(token, request.server.config.JWT_SECRET)
    }
  }

  throw httpError(401, 'Missing or invalid authorization token')
}
