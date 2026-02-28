import fp from 'fastify-plugin'

export class HttpError extends Error {
  statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.statusCode = statusCode
  }
}

export const httpError = (statusCode: number, message: string) =>
  new HttpError(statusCode, message)

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
