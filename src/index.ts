import type { Context } from 'grammy'
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

    // 处理 @ 提及
    bot.on('::mention', (ctx) => {
      if (!ctx.message?.text) {
        ctx.reply('🔴 Sorry, I can only handle text messages for now.')
        return
      }
      handleTextMessage(ctx, env)
    })

    // 处理回复消息
    bot.on('message').filter(ctx => !!ctx.msg.reply_to_message, (ctx) => {
      if (!ctx.message?.text) {
        ctx.reply('🔴 Sorry, I can only handle text messages for now.')
        return
      }
      handleTextMessage(ctx, env)
    })

    // 处理私聊消息
    bot.on('message:text').filter(ctx => ctx.chat.type === 'private', (ctx) => {
      handleTextMessage(ctx, env)
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

      // 静默记录消息到聊天历史
      addUserMessage(userId, userName, chatId, messageText)

      log(`[SILENT] ${userName} (${userId}) in ${ctx.chat?.title || 'group'}:`, messageText)
    }

    function handleTextMessage(ctx: Context, env: any) {
      if (!ctx.message?.text || !ctx.chat?.id)
        return

      let theMsg: Message.TextMessage
      let lastTime = Date.now()

      const messageText = ctx.message.text
      const userName = ctx.from?.first_name || 'User'
      const userId = ctx.from?.id || 0
      const chatId = ctx.chat.id
      const replyTextList: string[] = []

      // 清理群聊中的 @ 提及
      const cleanText = messageText.replace(/@\w+\s*/, '').trim()
      const finalText = cleanText || messageText

      log(`[MSG] ${userName} (${userId}) in ${ctx.chat.type}:`, finalText)

      invoke(async () => {
        theMsg = await ctx.reply(`🔵 Connecting...`)

        const chatHistory = addUserMessage(userId, userName, chatId, finalText)
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
              `🟢 Typing...\n\n${replyTextList.join('')}...`,
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
