import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { Message } from 'xsai'
import * as v from 'valibot'
import { tool } from 'xsai'
import { memoryTable } from '../database/memory'
import { error } from '../log'
import { invoke } from '../utils'

interface MemoryItem {
  text: string
}

let maxMemoryCount = 10
let database: PostgresJsDatabase | null = null
let isMemorySynchronized = false

const memoryStorage = new Map<number, MemoryItem[]>()

export function setMaxMemoryCount(count: number) {
  maxMemoryCount = count
}

export function setupMemoryDatabase(_db: PostgresJsDatabase | null) {
  if (database) {
    error('Memory database is already set, cannot set again.')
    return
  }
  database = _db

  invoke(async () => {
    if (!database)
      return

    try {
      const memoryList = await database.select().from(memoryTable)

      for (const memory of memoryList) {
        if (!Array.isArray(memory.content)) {
          error(`Memory content for user ${memory.userId} is not an array, skipping...`)
          continue
        }
        const existingMemory = memoryStorage.get(memory.userId) || []
        existingMemory.push(...memory.content)
        memoryStorage.set(memory.userId, existingMemory)
      }
      isMemorySynchronized = true
    }
    catch (err) {
      error('Failed to load memories from database:', err)
    }
  })
}

export function getMemorySyncStatus() {
  return isMemorySynchronized
}

export async function remember(option: { userId: number }) {
  return await tool({
    name: 'remember',
    description: 'Add a note about this user that you don\'t want to forget into long-term memory. NOTE: Do not write existing memories again.',
    parameters: v.object({
      // place: v.pipe(
      //   v.picklist(['user-private', 'chat-group', 'global'] as const),
      //   v.description('the place to store the memory, user-private means only you can access it, chat-group means all members in this group can access it, global means everyone can access it'),
      // ),
      text: v.pipe(
        v.string(),
        v.description('the information to be remembered, write it concisely and clearly.'),
      ),
    }),
    execute: async ({ text }) => {
      addMemoryByUserId(option.userId, { text })
      let message = `💾 Got it! I've remembered.`
      if (!database)
        message += '\nWARN: The system is not connected to the database, so memory notes is only kept in RAM.'
      return message
    },
  })
}

export function getMemories(userId: number): MemoryItem[] {
  return memoryStorage.get(userId) || []
}

export function addMemoryByUserId(userId: number, memoryItem: MemoryItem) {
  const memories = memoryStorage.get(userId) || []
  memories.push(memoryItem)
  if (memories.length > maxMemoryCount) {
    memories.shift()
  }
  memoryStorage.set(userId, memories)

  invoke(async () => {
    if (!database)
      return

    try {
      const now = Date.now()
      await database.insert(memoryTable).values({
        userId,
        content: memories,
        createdAt: now,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: memoryTable.userId,
        set: {
          content: memories,
          updatedAt: now,
        },
      })
    }
    catch (err) {
      error('Failed to save memory to database:', err)
    }
  })
}

export function getFormatedMemoriesMessage(userId: number, userName: string): Message | null {
  const memories = getMemories(userId)
  if (memories.length === 0)
    return null

  const memoriesText = memories.map((m, i) => `${i + 1}. ${m.text}`).join('\n\n')
  return {
    role: 'user',
    content: `Existing long-term memory of ${userName}:\n\n${memoriesText}`,
  }
}
