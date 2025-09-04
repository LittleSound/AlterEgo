import type { Message } from 'grammy/types'
import { streamText } from '@xsai/stream-text'
import { Elysia } from 'elysia'
import { Bot, webhookCallback } from 'grammy'
import { appEnvConfig } from './env'
import { log } from './log'
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
      const replyTextList: string[] = []

      log(`[MSG] ${userName}:`, messageText)

      invoke(async () => {
        theMsg = await ctx.reply(`🛜 Connecting...`)

        const { textStream } = streamText({
          apiKey: env.AI_OPENROUTER_API_KEY!,
          baseURL: env.AI_OPENROUTER_BASE_URL,
          messages: systemPrompt().concat([
            {
              content: messageText,
              role: 'user',
            },
          ]),
          model: env.AI_LLM_DEFAULT_MODEL,
        })
        for await (const textPart of textStream) {
          if (Date.now() - lastTime > EDIT_MESSAGE_INTERVAL) {
            lastTime = Date.now()
            await ctx.api.editMessageText(
              theMsg.chat.id,
              theMsg.message_id,
              `${replyTextList.join('')}\n⌨️ Typing...`,
            )
          }

          replyTextList.push(textPart)
        }

        log(`[REPLY] Alter Ego:`, replyTextList.join(''))

        await ctx.api.editMessageText(
          theMsg.chat.id,
          theMsg.message_id,
          `${replyTextList.join('')}`,
        )
      }).catch(async (error) => {
        log('Error processing message:', error)
        const errorText = '⚠️ 处理消息时出现了一些错误。我也不知道为什么…'
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
