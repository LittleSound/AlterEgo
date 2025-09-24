import type { Context } from 'grammy'
import type { Message as tgMessage } from 'grammy/types'
import type { Message as llmMessage } from 'xsai'
import { formatMessage, formatName } from './format'
import { log } from './log'

type GroupMessage = llmMessage & {
  userId: number
  userName: string
  timestamp: number
}
type PrivateMessage = llmMessage & {
  timestamp: number
}

const MAX_MESSAGES_PER_SESSION = 20

function getSessionKey(userId: number, chatId: number): string {
  return `${userId}@$@${chatId}`
}
function getGroupChatSessionKey(chatId: number): string {
  return `group@$@${chatId}`
}

export class BasicChatSessionMemory<T extends llmMessage> {
  private msg: T [] = []
  createdAt = Date.now()
  updatedAt = Date.now()

  constructor() {

  }

  get messages(): readonly T[] {
    return this.msg
  }

  addMessage(message: T): this {
    this.msg.push(message)
    this.updatedAt = Date.now()

    // If there are too many messages, delete the earliest messages.
    if (this.msg.length > MAX_MESSAGES_PER_SESSION) {
      this.msg.splice(0, 1)
    }
    return this
  }

  toMessages(): llmMessage[] {
    return [...this.msg]
  }

  clear() {
    this.msg.length = 0
    this.updatedAt = Date.now()
    return this
  }
}

export class PrivateChatSessionMemory extends BasicChatSessionMemory<PrivateMessage> {
  userId: number
  userName: string
  chatId: number

  constructor(option: { userId: number, userName: string, chatId: number }) {
    super()
    this.userId = option.userId
    this.userName = option.userName
    this.chatId = option.chatId
  }

  addUserMessage(content: string, options?: { timestamp?: number }) {
    const timestamp = options?.timestamp || Date.now()
    this.addMessage({ role: 'user', content, timestamp })
    // this.msg.push({ role: 'user', content })
    this.updatedAt = Date.now()

    log(`[MEMORY] Added user message for ${this.userName}. Total: ${this.messages.length}`)
    return this
  }

  addAssistantMessage(content: string, options?: { timestamp?: number }) {
    const timestamp = options?.timestamp || Date.now()
    this.addMessage({ role: 'assistant', content, timestamp })
    this.updatedAt = Date.now()

    log(`[MEMORY] Added assistant message for ${this.userName}. Total: ${this.messages.length}`)
    return this
  }

  toMessages(): llmMessage[] {
    return this.messages.map(({ timestamp, ...msg }) => msg)
  }
}

export class GroupChatSessionMemory extends BasicChatSessionMemory<GroupMessage> {
  chatId: number

  constructor(option: { chatId: number }) {
    super()
    this.chatId = option.chatId
  }

  addUserMessage(content: string, options: { userId: number, userName: string, timestamp?: number }) {
    const timestamp = options.timestamp || Date.now()
    this.addMessage({ role: 'user', content, userId: options.userId, userName: options.userName, timestamp })
    this.updatedAt = Date.now()

    log(`[MEMORY] Added user message for ${options.userName} in group ${this.chatId}. Total: ${this.messages.length}`)
    return this
  }

  addAssistantMessage(content: string, options?: { timestamp?: number }) {
    const timestamp = options?.timestamp || Date.now()
    this.addMessage({ role: 'assistant', content, timestamp, userId: 0, userName: '' })
    this.updatedAt = Date.now()

    log(`[MEMORY] Added assistant message in group ${this.chatId}. Total: ${this.messages.length}`)
    return this
  }

  toMessages(): llmMessage[] {
    return this.messages.map(({ userId, userName, ...msg }) => {
      msg.content = `[${userName}]: ${msg.content}`
      return msg
    })
  }
}

const chatSessionsMap = new Map<string, BasicChatSessionMemory<PrivateMessage | GroupMessage>>()

export function getPrivateChatSession(userId: number, userName: string, chatId: number): PrivateChatSessionMemory {
  const key = getSessionKey(userId, chatId)
  let session = chatSessionsMap.get(key) as PrivateChatSessionMemory | undefined

  if (!session) {
    session = new PrivateChatSessionMemory({ userId, userName, chatId })
    chatSessionsMap.set(key, session)
    log(`[MEMORY] Created new private chat session for ${userName} (${userId})`)
  }

  return session
}

export function getGroupChatSession(chatId: number): GroupChatSessionMemory {
  const key = getGroupChatSessionKey(chatId)
  let session = chatSessionsMap.get(key) as GroupChatSessionMemory | undefined

  if (!session) {
    session = new GroupChatSessionMemory({ chatId })
    chatSessionsMap.set(key, session)
    log(`[MEMORY] Created new group chat session for group ${chatId}`)
  }

  return session
}

export function getSessionMemoryStats(): { sessionsCount: number, totalMessages: number } {
  let totalMessages = 0

  for (const [,session] of chatSessionsMap) {
    totalMessages += session.messages.length
  }

  return {
    sessionsCount: chatSessionsMap.size,
    totalMessages,
  }
}

type SessionCtx = Pick<Context | tgMessage, 'from' | 'chat'>

function isGroupChat(ctx: Pick<SessionCtx, 'chat'>): boolean {
  return ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup'
}

export function getSessionByCtx(ctx: SessionCtx): PrivateChatSessionMemory | GroupChatSessionMemory | null {
  const chatId = ctx.chat?.id
  if (!chatId)
    return null
  const session = isGroupChat(ctx)
    ? getGroupChatSession(chatId)
    : getPrivateChatSession(ctx.from?.id || 0, formatName(ctx.from), chatId)
  return session
}

export function recordText(ctx: SessionCtx, text: string, options?: { isAssistant?: boolean }) {
  if (!text)
    return

  const userName = formatName(ctx.from)
  const userId = ctx.from?.id || 0

  const session = getSessionByCtx(ctx)
  if (!session)
    return
  if (options?.isAssistant) {
    session.addAssistantMessage(text)
  }
  else {
    session.addUserMessage(text, { userId, userName })
  }

  if (isGroupChat(ctx))
    log(`[SILENT] ${userName} (${userId}) in ${ctx.chat?.title || 'group'}:`, text)
  else
    log(`[SILENT] ${userName} (${userId}) in private chat:`, text)
}

// AI 会默默记录下不回复的消息，直到需要回答时使用
// 这样可以让 AI 了解群聊的上下文，但不会打扰到大家
export function recordMessage(message: tgMessage | undefined, options?: { isAssistant?: boolean }) {
  if (!message)
    return

  const requestMsgText = formatMessage(message)

  return recordText(message, requestMsgText, options)
}

export function recordUserText(ctx: SessionCtx, text: string) {
  return recordText(ctx, text, { isAssistant: false })
}

export function recordAssistantText(ctx: SessionCtx, text: string) {
  return recordText(ctx, text, { isAssistant: true })
}

export function getChatHistory(ctx: SessionCtx): llmMessage[] {
  const session = getSessionByCtx(ctx)
  if (!session)
    return []
  return session.toMessages()
}
