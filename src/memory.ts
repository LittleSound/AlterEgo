import type { Message } from 'xsai'
import { log } from './log'

export interface ChatSession {
  userId: number
  userName: string
  chatId: number
  date: string // YYYY-MM-DD format
  messages: Message[]
  createdAt: Date
  updatedAt: Date
}

const chatSessions = new Map<string, ChatSession>()

const MAX_MESSAGES_PER_SESSION = 20

function getSessionKey(userId: number, chatId: number): string {
  return `${userId}@$@${chatId}`
}

/**
 *  (YYYY-MM-DD)
 */
function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0]
}

export function getChatSession(userId: number, userName: string, chatId: number): ChatSession {
  const today = getTodayDateString()
  const sessionKey = getSessionKey(userId, chatId)

  let session = chatSessions.get(sessionKey)

  if (!session) {
    session = {
      userId,
      userName,
      chatId,
      date: today,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    chatSessions.set(sessionKey, session)
    log(`[MEMORY] Created new chat session for ${userName} (${userId}) on ${today}`)
  }

  return session
}

export function addUserMessage(userId: number, userName: string, chatId: number, content: string): Message[] {
  const session = getChatSession(userId, userName, chatId)

  session.messages.push({ role: 'user', content })
  session.updatedAt = new Date()

  // If there are too many messages, delete the earliest messages.
  if (session.messages.length > MAX_MESSAGES_PER_SESSION) {
    session.messages.splice(0, 2)
  }

  log(`[MEMORY] Added user message for ${userName}. Total: ${session.messages.length}`)
  return [...session.messages]
}

export function addAssistantMessage(userId: number, userName: string, chatId: number, content: string): void {
  const session = getChatSession(userId, userName, chatId)

  const assistantMessage: Message = {
    role: 'assistant',
    content,
  }

  session.messages.push(assistantMessage)
  session.updatedAt = new Date()

  log(`[MEMORY] Added assistant message for ${userName}. Total messages: ${session.messages.length}`)
}

export function getSessionHistory(userId: number, userName: string, chatId: number): Message[] {
  const session = getChatSession(userId, userName, chatId)
  return [...session.messages]
}

export function cleanupOldSessions(daysToKeep: number = 7): void {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

  let deletedCount = 0

  for (const [key, session] of chatSessions.entries()) {
    if (session.updatedAt < cutoffDate) {
      chatSessions.delete(key)
      deletedCount++
    }
  }

  if (deletedCount > 0) {
    log(`[MEMORY] Cleaned up ${deletedCount} old chat sessions`)
  }
}

export function getMemoryStats(): { sessionsCount: number, totalMessages: number } {
  let totalMessages = 0

  for (const session of chatSessions.values()) {
    totalMessages += session.messages.length
  }

  return {
    sessionsCount: chatSessions.size,
    totalMessages,
  }
}
