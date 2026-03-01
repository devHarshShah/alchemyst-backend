import { GoogleGenAI } from '@google/genai'
import { httpError } from '../plugins/error-handler'
import { StoredMessage } from '../ws/handlers/message.handler'

function extractGeminiErrorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      provider: 'gemini',
      message: error.message,
      name: error.name,
    }
  }

  if (typeof error === 'object' && error !== null) {
    const maybe = error as {
      message?: unknown
      code?: unknown
      status?: unknown
      error?: { message?: unknown; code?: unknown; status?: unknown }
    }

    return {
      provider: 'gemini',
      message: maybe.error?.message ?? maybe.message,
      code: maybe.error?.code ?? maybe.code,
      status: maybe.error?.status ?? maybe.status,
    }
  }

  return {
    provider: 'gemini',
    message: String(error),
  }
}

function friendlyGeminiError(action: string, error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : ''

  if (message.includes('api key')) {
    return 'AI service configuration is invalid right now. Please try again later.'
  }

  if (message.includes('quota') || message.includes('rate') || message.includes('resource_exhausted')) {
    return 'You have exceeded your AI usage quota. Please try again later.'
  }

  if (message.includes('timeout') || message.includes('timed out')) {
    return 'AI service timed out. Please try again.'
  }

  return `${action} right now. Please try again.`
}

export class GeminiAiStreamService {
  private readonly client?: GoogleGenAI
  private readonly model: string

  constructor(config: { apiKey?: string; model?: string }) {
    if (config.apiKey) {
      this.client = new GoogleGenAI({ apiKey: config.apiKey })
    }

    this.model = config.model ?? 'gemini-2.5-flash'
  }

  private ensureClient() {
    if (!this.client) {
      throw httpError(500, 'GEMINI_API_KEY is missing')
    }
  }

  private buildChatPrompt(history: StoredMessage[]): string {
    const transcript = history
      .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      .join('\n')

    return [
      'You are an AI assistant in a real-time conversation.',
      'Respond naturally and keep the answer concise unless asked for detail.',
      'Use the prior chat history to stay contextual.',
      '',
      'Conversation history:',
      transcript,
      '',
      'ASSISTANT:',
    ].join('\n')
  }

  async *streamReplyFromHistory(history: StoredMessage[]): AsyncGenerator<string> {
    this.ensureClient()

    if (history.length === 0) {
      throw httpError(400, 'history is required')
    }

    const prompt = this.buildChatPrompt(history)

    try {
      const stream = await this.client!.models.generateContentStream({
        model: this.model,
        contents: prompt,
      })

      for await (const chunk of stream) {
        const text = chunk.text ?? ''

        if (text) {
          yield text
        }
      }
    } catch (error) {
      throw httpError(502, friendlyGeminiError('AI could not generate a response', error), {
        code: 'AI_PROVIDER_ERROR',
        details: extractGeminiErrorDetails(error),
      })
    }
  }

  async generateSessionGreeting(): Promise<string> {
    this.ensureClient()

    try {
      const response = await this.client!.models.generateContent({
        model: this.model,
        contents:
          'Start the conversation with one friendly short greeting for a voice-agent style chat.',
      })

      const text = (response.text ?? '').trim()

      if (!text) {
        return 'Hey there, how can I help you today?'
      }

      return text
    } catch (error) {
      throw httpError(502, friendlyGeminiError('AI could not generate the greeting', error), {
        code: 'AI_PROVIDER_ERROR',
        details: extractGeminiErrorDetails(error),
      })
    }
  }

  async generateIdlePrompt(history: StoredMessage[]): Promise<string> {
    this.ensureClient()

    const recent = history.slice(-8)
    const transcript = recent
      .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      .join('\n')

    const prompt = [
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

    try {
      const response = await this.client!.models.generateContent({
        model: this.model,
        contents: prompt,
      })

      const text = (response.text ?? '').trim()

      if (!text) {
        return 'Hey, are you still there?'
      }

      return text
    } catch (error) {
      throw httpError(502, friendlyGeminiError('AI could not generate the idle follow-up', error), {
        code: 'AI_PROVIDER_ERROR',
        details: extractGeminiErrorDetails(error),
      })
    }
  }

  async generateSessionEndMessage(history: StoredMessage[]): Promise<string> {
    this.ensureClient()

    const recent = history.slice(-10)
    const transcript = recent
      .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
      .join('\n')

    const prompt = [
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

    try {
      const response = await this.client!.models.generateContent({
        model: this.model,
        contents: prompt,
      })

      const text = (response.text ?? '').trim()

      if (!text) {
        return 'Ending this chat due to inactivity. Start a new session when you are back.'
      }

      return text
    } catch (error) {
      throw httpError(502, friendlyGeminiError('AI could not generate the session end message', error), {
        code: 'AI_PROVIDER_ERROR',
        details: extractGeminiErrorDetails(error),
      })
    }
  }
}
