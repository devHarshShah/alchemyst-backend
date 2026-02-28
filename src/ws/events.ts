export const CLIENT_EVENTS = {
  JOIN: 'join',
  USER_MESSAGE: 'user_message',
  PING: 'ping',
} as const

export const SERVER_EVENTS = {
  CONNECTED: 'connected',
  JOINED: 'joined',
  HISTORY: 'history',
  SESSION_STARTED: 'session_started',
  MESSAGE_RECEIVED: 'message_received',
  ASSISTANT_STREAM_START: 'assistant_stream_start',
  ASSISTANT_STREAM_CHUNK: 'assistant_stream_chunk',
  ASSISTANT_STREAM_END: 'assistant_stream_end',
  ASSISTANT_INTERRUPTED: 'assistant_interrupted',
  ASSISTANT_MESSAGE: 'assistant_message',
  PONG: 'pong',
  ERROR: 'error',
} as const
