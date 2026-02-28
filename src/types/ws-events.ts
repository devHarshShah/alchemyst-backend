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

export type MessageReceivedServerEvent = {
  type: typeof SERVER_EVENTS.MESSAGE_RECEIVED
  sessionId: string
  text: string
}

export type AssistantMessageServerEvent = {
  type: typeof SERVER_EVENTS.ASSISTANT_MESSAGE
  sessionId: string
  text: string
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
  | MessageReceivedServerEvent
  | AssistantMessageServerEvent
  | PongServerEvent
  | ErrorServerEvent
