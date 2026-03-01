import { GoogleGenAI } from '@google/genai'
import { httpError } from '../plugins/error-handler'
import { StoredMessage } from '../ws/handlers/message.handler'
import {
  buildChatPrompt,
  buildIdlePrompt,
  buildSessionEndPrompt,
  DEFAULT_GREETING_MESSAGE,
  DEFAULT_IDLE_FOLLOWUP_MESSAGE,
  DEFAULT_SESSION_END_MESSAGE,
  GREETING_PROMPT,
} from './ai-prompts'

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

  async *streamReplyFromHistory(history: StoredMessage[]): AsyncGenerator<string> {
    this.ensureClient()

    if (history.length === 0) {
      throw httpError(400, 'history is required')
    }

    const prompt = buildChatPrompt(history)

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
        contents: GREETING_PROMPT,
      })

      const text = (response.text ?? '').trim()

      if (!text) {
        return DEFAULT_GREETING_MESSAGE
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

    const prompt = buildIdlePrompt(history)

    try {
      const response = await this.client!.models.generateContent({
        model: this.model,
        contents: prompt,
      })

      const text = (response.text ?? '').trim()

      if (!text) {
        return DEFAULT_IDLE_FOLLOWUP_MESSAGE
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

    const prompt = buildSessionEndPrompt(history)

    try {
      const response = await this.client!.models.generateContent({
        model: this.model,
        contents: prompt,
      })

      const text = (response.text ?? '').trim()

      if (!text) {
        return DEFAULT_SESSION_END_MESSAGE
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
