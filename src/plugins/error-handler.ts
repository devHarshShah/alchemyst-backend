import fp from 'fastify-plugin'

export class HttpError extends Error {
  statusCode: number
  code?: string
  details?: unknown

  constructor(statusCode: number, message: string, options?: { code?: string; details?: unknown }) {
    super(message)
    this.name = 'HttpError'
    this.statusCode = statusCode
    this.code = options?.code
    this.details = options?.details
  }
}

export const httpError = (
  statusCode: number,
  message: string,
  options?: { code?: string; details?: unknown }
) => new HttpError(statusCode, message, options)

export default fp(async (fastify) => {
  fastify.setErrorHandler((error, _request, reply) => {
    const err = error as { statusCode?: unknown; message?: string }
    const statusCode =
      typeof err.statusCode === 'number'
        ? Number(err.statusCode)
        : 500

    reply.status(statusCode).send({
      statusCode,
      reason: err.message || 'Internal Server Error',
    })
  })
})
