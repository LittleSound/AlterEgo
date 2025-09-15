import * as v from 'valibot'
import { tool } from 'xsai'

export async function browse(env?: { BROWSE_MAX_TOKENS?: number, JINA_API_TOKEN?: string }) {
  return await tool({
    description: 'Browse and fetch webpage content',
    name: 'browse',
    parameters: v.object({
      url: v.pipe(
        v.string(),
        v.description('The URL of the webpage'),
      ),
    }),
    execute: async ({ url }) => {
      const abort = new AbortController()
      const timeout = setTimeout(() => abort.abort(), 15_000)

      try {
        const jinaUrl = `https://r.jina.ai/${url}`
        const jinaToken = env?.JINA_API_TOKEN

        const headers: Record<string, string> = {
          'X-Retain-Images': 'none',
        }

        if (jinaToken) {
          headers.Authorization = `Bearer ${jinaToken}`
        }

        const response = await fetch(jinaUrl, {
          method: 'GET',
          headers,
          signal: abort.signal,
        })

        if (!response.ok) {
          return JSON.stringify({
            ok: false,
            error: `Failed to fetch webpage: ${response.status} ${response.statusText}`,
            url,
          })
        }

        const content = await response.text()

        // Estimate tokens and truncate if needed (assuming ~2.5 chars per token)
        const maxTokens = env?.BROWSE_MAX_TOKENS || 16000
        const maxChars = maxTokens * 2.5

        const finalContent = content.length > maxChars
          ? `${content.slice(0, maxChars)}\n\n[Content truncated due to length limit]`
          : content

        return finalContent
      }
      catch (err) {
        return `Failed to fetch webpage content. ERROR: ${err instanceof Error ? err.message : String(err)}`
      }
      finally {
        clearTimeout(timeout)
      }
    },
  })
}
