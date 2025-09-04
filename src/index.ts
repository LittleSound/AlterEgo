import { env } from '@yolk-oss/elysia-env'
import { Elysia, t } from 'elysia'
import { Bot, webhookCallback } from 'grammy'
import { log } from './log'

const app = new Elysia()
  .use(
    env({
      TELEGRAM_BOT_TOKEN: t.String({
        minLength: 40,
        error: 'A valid Telegram bot token is required!',
      }),
    }),
  )
  .derive(({ env }) => {
    const bot = new Bot(env.TELEGRAM_BOT_TOKEN)

    bot.command('start', (ctx) => {
      ctx.reply('🤖 Hello. Hello. I am Alter Ego! I\'m a Chat Bot. You can say "Hi" with me.')
    })

    bot.on('message', async (ctx) => {
      // TODO 处理非文本消息
      if (!ctx.message.text) {
        await ctx.reply('Sorry, I can only handle text messages for now.')
      }

      const messageText = ctx.message.text
      const userName = ctx.from?.first_name || 'User'

      log('Received message:', messageText, 'from:', userName)

      try {
        const theMsg = await ctx.reply(`Hello ${userName}! I received your message. Please wait a moment...`)

        // 等待一秒钟
        await new Promise(resolve => setTimeout(resolve, 1000))

        // 第一次编辑消息内容
        await ctx.api.editMessageText(
          theMsg.chat.id,
          theMsg.message_id,
          `${theMsg.text}\n\n喵～`,
        )

        // 再等待一秒钟
        await new Promise(resolve => setTimeout(resolve, 1000))

        // 第二次编辑消息内容
        await ctx.api.editMessageText(
          theMsg.chat.id,
          theMsg.message_id,
          `${theMsg.text}\n\n喵～\n\n✨ 我是 Alter Ego！`,
        )
      }
      catch (error) {
        log('Error processing message:', error)
        await ctx.reply('抱歉，处理消息时出现了错误 😅')
      }
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
