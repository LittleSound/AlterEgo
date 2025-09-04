import type { Context } from 'grammy'
import type { Message } from 'grammy/types'
import type { GroupChatSessionMemory, PrivateChatSessionMemory } from './memory'
import { streamText } from '@xsai/stream-text'
import { Elysia } from 'elysia'
import { Bot, webhookCallback } from 'grammy'
import { appEnvConfig } from './env'
import { log } from './log'
import { getGroupChatSession, getMemoryStats, getPrivateChatSession } from './memory'
import { systemPrompt } from './prompt'
import { invoke } from './utils'

const EDIT_MESSAGE_INTERVAL = 1000

function cleanAIResponse(text: string): string {
  // 清理 AI 回复开头的 [...]： 格式
  return text.replace(/^\s*\[[^\]]*\]:\s*/, '')
}

const app = new Elysia()
  .use(appEnvConfig)
  .derive(({ env }) => {
    const bot = new Bot(env.TELEGRAM_BOT_TOKEN)

    bot.command('start', (ctx) => {
      ctx.reply('🤖 Hello. Hello. I am Alter Ego! I\'m a Chat Bot. You can say "Hi" with me.')
    })

    bot.command('memory', (ctx) => {
      const stats = getMemoryStats()
      ctx.reply(`📊 Memory Stats:\n• Active sessions: ${stats.sessionsCount}\n• Total messages: ${stats.totalMessages}\n\nI remember our conversations for today! 💭`)
    })

    // 处理 @ 提及
    bot.on('::mention', (ctx) => {
      if (!ctx.message?.text) {
        ctx.reply('🔴 Sorry, I can only handle text messages for now.')
        return
      }
      const session = getGroupChatSession(ctx.chat.id)
      handleTextMessage(ctx, {
        addUserMessage: content => session.addUserMessage(content, { userId: ctx.from?.id || 0, userName: ctx.from?.first_name || 'User' }),
        addAssistantMessage: content => session.addAssistantMessage(content),
        session,
      })
    })

    // 处理回复消息
    bot.on('message').filter(ctx => !!(ctx.chat.type !== 'private' && ctx.msg.reply_to_message && ctx.msg.text), (ctx) => {
      const session = getGroupChatSession(ctx.chat.id)
      handleTextMessage(ctx, {
        addUserMessage: content => session.addUserMessage(content, { userId: ctx.from?.id || 0, userName: ctx.from?.first_name || 'User' }),
        addAssistantMessage: content => session.addAssistantMessage(content),
        session,
      })
    })

    // 处理私聊消息
    bot.on('message:text').filter(ctx => ctx.chat.type === 'private', (ctx) => {
      const userName = ctx.from?.first_name || 'User'
      const userId = ctx.from?.id || 0
      const chatId = ctx.chat.id
      const session = getPrivateChatSession(userId, userName, chatId)
      handleTextMessage(ctx, {
        addUserMessage: content => session.addUserMessage(content),
        addAssistantMessage: content => session.addAssistantMessage(content),
        session,
      })
    })

    // 群聊中的普通消息 - 仅记录，不回复（需要机器人是管理员）
    // 提及和回复消息由上面的处理器处理并记录，所以这里需要跳过记录
    bot.on('message:text').filter(ctx =>
      (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')
      && !ctx.message.text?.includes('@') // 不包含@提及
      && !ctx.msg.reply_to_message, // 不是回复消息
    (ctx) => {
      silentlyRecordMessage(ctx)
    })

    function silentlyRecordMessage(ctx: Context) {
      if (!ctx.message?.text)
        return

      const messageText = ctx.message.text
      const userName = ctx.from?.first_name || 'User'
      const userId = ctx.from?.id || 0
      const chatId = ctx.chat?.id

      if (!chatId)
        return

      const session = getGroupChatSession(chatId)
      session.addUserMessage(messageText, { userId, userName })

      log(`[SILENT] ${userName} (${userId}) in ${ctx.chat?.title || 'group'}:`, messageText)
    }

    function handleTextMessage(ctx: Context, option: {
      addUserMessage: (content: string) => void
      addAssistantMessage: (content: string) => void
      session: GroupChatSessionMemory | PrivateChatSessionMemory
    }) {
      if (!ctx.message?.text || !ctx.chat?.id)
        return

      let theMsg: Message.TextMessage
      let lastTime = Date.now()

      const messageText = ctx.message.text
      const userName = ctx.from?.first_name || 'User'
      const userId = ctx.from?.id || 0
      const replyTextList: string[] = []

      // 清理群聊中的 @ 提及
      const cleanText = messageText.replace(/@\w+\s*/, '').trim()
      const finalText = cleanText || messageText

      log(`[MSG] ${userName} (${userId}) in ${ctx.chat.type}:`, finalText)

      invoke(async () => {
        theMsg = await ctx.reply(`🔵 Connecting...`)

        option.addUserMessage(finalText)
        const chatHistory = option.session.toMessages()
        const messages = systemPrompt({ userName, chatType: ctx.chat?.type }).concat(chatHistory)

        const { textStream } = streamText({
          apiKey: env.AI_OPENROUTER_API_KEY!,
          baseURL: env.AI_OPENROUTER_BASE_URL,
          messages,
          model: env.AI_LLM_DEFAULT_MODEL,
        })

        for await (const textPart of textStream) {
          replyTextList.push(textPart)

          if (Date.now() - lastTime > EDIT_MESSAGE_INTERVAL) {
            lastTime = Date.now()
            const cleanedPartial = cleanAIResponse(replyTextList.join(''))
            await ctx.api.editMessageText(
              theMsg.chat.id,
              theMsg.message_id,
              `🟢 Typing...\n\n${cleanedPartial}...`,
            )
          }
        }

        const finalResponse = cleanAIResponse(replyTextList.join(''))

        log(`[REPLY] Alter Ego:`, finalResponse)

        option.addAssistantMessage(finalResponse)

        await ctx.api.editMessageText(
          theMsg.chat.id,
          theMsg.message_id,
          finalResponse,
        )

        // 输出内存统计
        const stats = getMemoryStats()
        log(`[MEMORY] Sessions: ${stats.sessionsCount}, Total messages: ${stats.totalMessages}`)
      }).catch(async (error) => {
        log('Error processing message:', error)
        const errorText = '🔴 Something went wrong. I don\'t know what to say next...'
        if (theMsg) {
          const partialResponse = replyTextList.length > 0
            ? cleanAIResponse(replyTextList.join(''))
            : ''
          const finalErrorMsg = partialResponse
            ? `${partialResponse}\n\n${errorText}`
            : errorText
          await ctx.api.editMessageText(
            theMsg.chat.id,
            theMsg.message_id,
            finalErrorMsg,
          )
        }
        else {
          await ctx.reply(errorText)
        }
      })
    }

    return { bot }
  })
  .get('/', () => 'Hello. I am Alter Ego! 🤖')
  .post('/', async ({ request, bot }) => {
    const callback = webhookCallback(bot, 'std/http')
    return await callback(request)
  })
  .listen(34466)

// eslint-disable-next-line no-console
console.log(`🦊. Alter Ego is running at ${app.server?.hostname}:${app.server?.port}`)
