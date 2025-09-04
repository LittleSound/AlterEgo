import type { Message } from 'grammy/types'
import { streamText } from '@xsai/stream-text'
import { Elysia } from 'elysia'
import { Bot, webhookCallback } from 'grammy'
import { appEnvConfig } from './env'
import { log } from './log'
import { addAssistantMessage, addUserMessage, getMemoryStats } from './memory'
import { systemPrompt } from './prompt'
import { invoke } from './utils'

const EDIT_MESSAGE_INTERVAL = 1000

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

    bot.on('message', (ctx) => {
      // TODO 处理非文本消息
      if (!ctx.message.text) {
        ctx.reply('Sorry, I can only handle text messages for now.')
        return
      }

      let theMsg: Message.TextMessage
      let lastTime = Date.now()

      const messageText = ctx.message.text
      const userName = ctx.from?.first_name || 'User'
      const userId = ctx.from?.id || 0
      const chatId = ctx.chat.id
      const replyTextList: string[] = []

      log(`[MSG] ${userName} (${userId}):`, messageText)

      invoke(async () => {
        theMsg = await ctx.reply(`🔵 Connecting...`)

        const chatHistory = addUserMessage(userId, userName, chatId, messageText)
        const messages = systemPrompt().concat(chatHistory)

        const { textStream } = streamText({
          apiKey: env.AI_OPENROUTER_API_KEY!,
          baseURL: env.AI_OPENROUTER_BASE_URL,
          messages,
          model: env.AI_LLM_DEFAULT_MODEL,
        })

        for await (const textPart of textStream) {
          if (Date.now() - lastTime > EDIT_MESSAGE_INTERVAL) {
            lastTime = Date.now()
            await ctx.api.editMessageText(
              theMsg.chat.id,
              theMsg.message_id,
              `${replyTextList.join('')}\n\n🟢 Typing...`,
            )
          }

          replyTextList.push(textPart)
        }

        const finalResponse = replyTextList.join('')
        log(`[REPLY] Alter Ego:`, finalResponse)

        addAssistantMessage(userId, userName, chatId, finalResponse)

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
          await ctx.api.editMessageText(
            theMsg.chat.id,
            theMsg.message_id,
            replyTextList.length ? `${replyTextList.join('')}\n\n${errorText}` : errorText,
          )
        }
        else {
          await ctx.reply(`${errorText}`)
        }
      })
    })

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
