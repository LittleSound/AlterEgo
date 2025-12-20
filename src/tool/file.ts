import type { Context } from 'grammy'
import { InputFile } from 'grammy'
import * as v from 'valibot'
import { tool } from 'xsai'
import { error, log } from '../log'
import { recordAssistantText } from '../session'

export async function createFile(option: { ctx: Context }) {
  return await tool({
    name: 'create_file',
    description: 'Create a file with specified content and send it to the user via Telegram.'
      + ' Use this when users want to create, download, or receive files like markdown documents.'
      + ' Some formats use plain text encoding, like markdown, ics, csv, json, xml, yaml, toml, ini, latex, html, etc.',
    parameters: v.object({
      filename: v.pipe(
        v.string(),
        v.minLength(1),
        v.description('Filename with extension (e.g., "ShoppingList.md", "notes.txt", "script.py"). Must include file extension.'),
      ),
      content: v.pipe(
        v.string(),
        v.minLength(1),
        v.description('The complete content of the file to be created.'),
      ),
    }),
    execute: async ({ filename, content }) => {
      try {
        log(`[FILE] Creating file: ${filename} (${content.length} bytes)`)

        // Validate filename
        if (!filename.includes('.')) {
          return '❌ Error: Filename must include a file extension (e.g., "file.txt", "document.md").'
        }

        // Create file from content
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
        const arrayBuffer = await blob.arrayBuffer()
        const uint8Array = new Uint8Array(arrayBuffer)
        const file = new InputFile(uint8Array, filename)

        // Send the file via Telegram
        await option.ctx.replyWithDocument(file, {
          caption: `📄 ${filename}`,
        })

        recordAssistantText(option.ctx, `[Tools Info: File sent: ${filename}]`)

        return `✅ File "${filename}" has been created and sent to you.`
      }
      catch (err) {
        error('Failed to create file:', err)
        return `❌ Failed to create file: ${err instanceof Error ? err.message : String(err)}`
      }
    },
  })
}
