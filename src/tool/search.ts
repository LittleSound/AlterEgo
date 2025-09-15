import * as v from 'valibot'
import { tool } from 'xsai'

export async function search(env?: { BROWSE_MAX_TOKENS?: number, JINA_API_TOKEN?: string }) {
  return await tool({
    description: 'Search the web for relevant content and return titles and URLs. NOTE: To save developers\' money, search only one page at a time.',
    name: 'search',
    parameters: v.object({
      query: v.pipe(
        v.string(),
        v.description('plain text, The thing you want to search for'),
      ),
    }),
    execute: async ({ query }) => {
      const abort = new AbortController()
      const timeout = setTimeout(() => abort.abort(), 15_000)

      try {
        const searchUrl = new URL('https://s.jina.ai/')
        searchUrl.searchParams.set('q', query)
        const jinaToken = env?.JINA_API_TOKEN

        const headers: Record<string, string> = {
          'X-Respond-With': 'no-content',
        }

        if (jinaToken) {
          headers.Authorization = `Bearer ${jinaToken}`
        }

        const response = await fetch(searchUrl.toString(), {
          method: 'GET',
          headers,
          signal: abort.signal,
        })

        if (!response.ok) {
          return `Failed to search: ${response.status} ${response.statusText}`
        }

        const content = await response.text()

        // Estimate tokens and truncate if needed (assuming ~2.5 chars per token)
        const maxTokens = env?.BROWSE_MAX_TOKENS || 16000
        const maxChars = maxTokens * 2.5

        const finalContent = content.length > maxChars
          ? `${content.slice(0, maxChars)}\n\n[Content truncated due to length limit]`
          : content

        return `${finalContent}\n\nThe above result is only visible to you. Reference only.\nUse it to answer or make the next plan.`
      }
      catch (err) {
        return `Failed to perform search. ERROR: ${err instanceof Error ? err.message : String(err)}`
      }
      finally {
        clearTimeout(timeout)
      }
    },
  })
}
