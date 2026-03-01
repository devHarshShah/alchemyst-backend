import { StoredMessage } from '../ws/handlers/message.handler'

export const DEFAULT_GREETING_MESSAGE = 'Hey there, how can I help you today?'
export const DEFAULT_IDLE_FOLLOWUP_MESSAGE = 'Hey, are you still there?'
export const DEFAULT_SESSION_END_MESSAGE =
  'Ending this chat due to inactivity. Start a new session when you are back.'

export const GREETING_PROMPT =
  [
    'You are a phone-call voice assistant.',
    'Return exactly one short spoken greeting sentence.',
    'Do not provide multiple options, variants, bullet points, numbering, labels, or quotes.',
    'Sound natural for a live call.',
    'Example style: "Hi, thanks for calling. How can I help you today?"',
  ].join('\n')

function toTranscript(messages: StoredMessage[]): string {
  return messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join('\n')
}

export function buildChatPrompt(history: StoredMessage[]): string {
  return [
    'You are a phone-call voice assistant in a real-time conversation.',
    'Write like natural speech for a live call.',
    'Return one direct reply, not options or lists.',
    'No markdown, no labels, no bullet points, no numbering.',
    'Keep it concise unless asked for detail.',
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
    'You are a phone-call voice assistant in a live chat.',
    'The user has gone silent for about a minute.',
    'Generate exactly one short spoken follow-up to check if they are still there.',
    'Do not provide options, lists, markdown, labels, or explanation.',
    'Example style: "Hey, are you still with me?"',
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
    'You are a phone-call voice assistant in a live chat.',
    'The user has been inactive despite repeated follow-ups.',
    'Generate exactly one short polite final spoken message saying the session is ending due to inactivity.',
    'Ask them to start a new session when they return.',
    'Do not provide options, lists, markdown, labels, or explanation.',
    'Example style: "I will end this chat for now due to inactivity. Please start a new chat when you are back."',
    '',
    'Recent conversation:',
    transcript || '(no prior messages)',
    '',
    'Final assistant message:',
  ].join('\n')
}
