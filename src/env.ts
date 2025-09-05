import { env } from '@yolk-oss/elysia-env'
import { t } from 'elysia'

export const appEnvConfig = env({
  // CLI Options
  VERBOSE: t.Boolean({
    default: false,
    description: 'Enable verbose logging',
  }),

  TELEGRAM_BOT_TOKEN: t.String({
    error: 'A valid Telegram bot token is required!',
  }),

  // Models
  AI_LLM_DEFAULT_MODEL: t.String({
    default: 'openai/gpt-5-chat',
    error: 'A valid LLM model is required!',
  }),

  // Open Router
  AI_OPENROUTER_API_KEY: t.String({
    error: 'A valid AI API Key is required!',
  }),
  AI_OPENROUTER_BASE_URL: t.String({
    default: 'https://openrouter.ai/api/v1',
    error: 'A valid AI Base URL is required!',
  }),
})
