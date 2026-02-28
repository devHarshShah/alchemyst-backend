export const CLIENT_EVENTS = {
  JOIN: 'join',
  USER_MESSAGE: 'user_message',
  PING: 'ping',
} as const

export const SERVER_EVENTS = {
  CONNECTED: 'connected',
  JOINED: 'joined',
  MESSAGE_RECEIVED: 'message_received',
  ASSISTANT_MESSAGE: 'assistant_message',
  PONG: 'pong',
  ERROR: 'error',
} as const
