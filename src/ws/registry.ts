import WebSocket from 'ws'
import { ServerEvent } from '../types/ws-events'

type ConnectionEntry = {
  socket: WebSocket
  sessionId?: string
}

const connections = new Map<string, ConnectionEntry>()

export function addConnection(connectionId: string, socket: WebSocket) {
  connections.set(connectionId, { socket })
}

export function removeConnection(connectionId: string) {
  connections.delete(connectionId)
}

export function setConnectionSession(connectionId: string, sessionId: string) {
  const connection = connections.get(connectionId)

  if (!connection) {
    return
  }

  connection.sessionId = sessionId
}

export function getConnectionSession(connectionId: string): string | undefined {
  return connections.get(connectionId)?.sessionId
}

export function sendEvent(connectionId: string, payload: ServerEvent) {
  const connection = connections.get(connectionId)

  if (!connection) {
    return
  }

  if (connection.socket.readyState === WebSocket.OPEN) {
    connection.socket.send(JSON.stringify(payload))
  }
}

export function sendEventToSession(sessionId: string, payload: ServerEvent) {
  for (const connection of connections.values()) {
    if (connection.sessionId !== sessionId) {
      continue
    }

    if (connection.socket.readyState === WebSocket.OPEN) {
      connection.socket.send(JSON.stringify(payload))
    }
  }
}
