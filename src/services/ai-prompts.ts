import { StoredMessage } from '../ws/handlers/message.handler'

export const DEFAULT_GREETING_MESSAGE = 'Hey there, how can I help you today?'
export const DEFAULT_IDLE_FOLLOWUP_MESSAGE = 'Hey, are you still there?'
export const DEFAULT_SESSION_END_MESSAGE =
  'Ending this chat due to inactivity. Start a new session when you are back.'

export const GREETING_PROMPT =
  'Start the conversation with one friendly short greeting for a voice-agent style chat.'

function toTranscript(messages: StoredMessage[]): string {
  return messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join('\n')
}

export function buildChatPrompt(history: StoredMessage[]): string {
  return [
    'You are an AI assistant in a real-time conversation.',
    'Respond naturally and keep the answer concise unless asked for detail.',
    'Use the prior chat history to stay contextual.',
    '',
    'Conversation history:',
    toTranscript(history),
    '',
    'ASSISTANT:',
  ].join('\n')
}

export function buildIdlePrompt(history: StoredMessage[]): string {
  const recent = history.slice(-8)
  const transcript = toTranscript(recent)

  return [
    'You are an AI assistant in a live chat.',
    'The user has gone silent for about a minute.',
    'Generate one short natural follow-up to check if they are still there.',
    'Do not include markdown, labels, or explanation.',
    '',
    'Recent conversation:',
    transcript || '(no prior messages)',
    '',
    'Assistant follow-up:',
  ].join('\n')
}

export function buildSessionEndPrompt(history: StoredMessage[]): string {
  const recent = history.slice(-10)
  const transcript = toTranscript(recent)

  return [
    'You are an AI assistant in a live chat.',
    'The user has been inactive despite repeated follow-ups.',
    'Generate one short polite final message saying the session is being ended due to inactivity.',
    'Ask them to start a new session when they return.',
    'Do not include markdown, labels, or explanation.',
    '',
    'Recent conversation:',
    transcript || '(no prior messages)',
    '',
    'Final assistant message:',
  ].join('\n')
}
