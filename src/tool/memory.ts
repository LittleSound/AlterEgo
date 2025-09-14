import type { Message } from 'xsai'
import * as v from 'valibot'
import { tool } from 'xsai'

const memoryStorage = new Map<number, string[]>()

let maxMemoryCount = 10
export function setMaxMemoryCount(count: number) {
  maxMemoryCount = count
}

export async function remember(option: { userId: number }) {
  return await tool({
    name: 'remember',
    description: 'store a piece of information into long-term memory',
    parameters: v.object({
      // place: v.pipe(
      //   v.picklist(['user-private', 'chat-group', 'global'] as const),
      //   v.description('the place to store the memory, user-private means only you can access it, chat-group means all members in this group can access it, global means everyone can access it'),
      // ),
      text: v.pipe(
        v.string(),
        v.description('the information to be remembered'),
      ),
    }),
    execute: async ({ text }) => {
      const memories = memoryStorage.get(option.userId) || []
      memories.push(text)
      if (memories.length > maxMemoryCount) {
        memories.shift()
      }
      memoryStorage.set(option.userId, memories)
      return `Got it! I've remembered.`
    },
  })
}

export function getMemories(userId: number): string[] {
  return memoryStorage.get(userId) || []
}

export function getFormatedMemoriesMessage(userId: number): Message | null {
  const memories = getMemories(userId)
  if (memories.length === 0)
    return null

  const memoriesText = memories.map((m, i) => `${i + 1}. ${m}`).join('\n\n')
  return {
    role: 'user',
    content: `Memory:\n\n${memoriesText}`,
  }
}
