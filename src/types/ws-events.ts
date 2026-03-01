import { CLIENT_EVENTS, SERVER_EVENTS } from '../ws/events'

export type JoinClientEvent = {
  type: typeof CLIENT_EVENTS.JOIN
  sessionId?: string
}

export type UserMessageClientEvent = {
  type: typeof CLIENT_EVENTS.USER_MESSAGE
  text: string
}

export type PingClientEvent = {
  type: typeof CLIENT_EVENTS.PING
}

export type ClientEvent = JoinClientEvent | UserMessageClientEvent | PingClientEvent

export type ConnectedServerEvent = {
  type: typeof SERVER_EVENTS.CONNECTED
  connectionId: string
}

export type JoinedServerEvent = {
  type: typeof SERVER_EVENTS.JOINED
  sessionId: string
}

export type HistoryServerEvent = {
  type: typeof SERVER_EVENTS.HISTORY
  sessionId: string
  messages: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string
    timestamp: string
    interrupted?: boolean
  }>
}

export type SessionStartedServerEvent = {
  type: typeof SERVER_EVENTS.SESSION_STARTED
  sessionId: string
}

export type SessionEndedServerEvent = {
  type: typeof SERVER_EVENTS.SESSION_ENDED
  sessionId: string
  reason: string
}

export type MessageReceivedServerEvent = {
  type: typeof SERVER_EVENTS.MESSAGE_RECEIVED
  sessionId: string
  text: string
}

export type AssistantStreamStartServerEvent = {
  type: typeof SERVER_EVENTS.ASSISTANT_STREAM_START
  sessionId: string
}

export type AssistantStreamChunkServerEvent = {
  type: typeof SERVER_EVENTS.ASSISTANT_STREAM_CHUNK
  sessionId: string
  chunk: string
}

export type AssistantStreamEndServerEvent = {
  type: typeof SERVER_EVENTS.ASSISTANT_STREAM_END
  sessionId: string
  text: string
}

export type AssistantInterruptedServerEvent = {
  type: typeof SERVER_EVENTS.ASSISTANT_INTERRUPTED
  sessionId: string
  partialText: string
}

export type AssistantMessageServerEvent = {
  type: typeof SERVER_EVENTS.ASSISTANT_MESSAGE
  sessionId: string
  text: string
  timestamp?: string
  interrupted?: boolean
}

export type PongServerEvent = {
  type: typeof SERVER_EVENTS.PONG
  timestamp: string
}

export type ErrorServerEvent = {
  type: typeof SERVER_EVENTS.ERROR
  statusCode: number
  reason: string
}

export type ServerEvent =
  | ConnectedServerEvent
  | JoinedServerEvent
  | HistoryServerEvent
  | SessionStartedServerEvent
  | SessionEndedServerEvent
  | MessageReceivedServerEvent
  | AssistantStreamStartServerEvent
  | AssistantStreamChunkServerEvent
  | AssistantStreamEndServerEvent
  | AssistantInterruptedServerEvent
  | AssistantMessageServerEvent
  | PongServerEvent
  | ErrorServerEvent
