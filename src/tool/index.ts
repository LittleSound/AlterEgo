import type { Tool } from 'xsai'
import { browse } from './browse'
import { search } from './search'
import { weather } from './weather'

export async function setupTools(env: { BROWSE_ENABLED: boolean, SEARCH_ENABLED: boolean, BROWSE_MAX_TOKENS: number, JINA_API_TOKEN: string }): Promise<Tool[]> {
  const tools = [
    weather(),
  ]

  if (env.BROWSE_ENABLED) {
    tools.push(browse(env))
  }
  if (env.SEARCH_ENABLED) {
    tools.push(search(env))
  }

  return await Promise.all(tools)
}
