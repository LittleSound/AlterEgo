import type { Tool } from 'xsai'
import { browse } from './browse'
import { weather } from './weather'

export async function setupTools(env?: { BROWSE_ENABLED?: boolean, BROWSE_MAX_TOKENS?: number, JINA_API_TOKEN?: string }): Promise<Tool[]> {
  const tools = [
    weather(),
  ]

  if (env?.BROWSE_ENABLED !== false) {
    tools.push(browse(env))
  }

  return await Promise.all(tools)
}
