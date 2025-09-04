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
      ctx.reply('🤖 Welcome! I\'m your AI bot powered by grammY and ElysiaJS!')
    })

    bot.on('message:text', (ctx) => {
      const messageText = ctx.message.text
      const userName = ctx.from?.first_name || 'User'

      log('Received message:', messageText, 'from:', userName)

      ctx.reply(`Hello ${userName}! I received your message:\n\n"${messageText}"\n\n🚀 Powered by grammY + ElysiaJS + Bun`)
    })

    bot.on('message', (ctx) => {
      if (!ctx.message.text) {
        ctx.reply('Sorry, I can only handle text messages for now.')
      }
    })

    return { bot }
  })
  .get('/', () => 'Hello Elysia + grammY Bot! 🤖')
  .post('/', async ({ request, bot }) => {
    const callback = webhookCallback(bot, 'std/http')
    return await callback(request)
  })
  .listen(34466)

// eslint-disable-next-line no-console
console.log(`🦊 Elysia + grammY bot is running at ${app.server?.hostname}:${app.server?.port}`)
