import { env } from '@yolk-oss/elysia-env'
import { Elysia, t } from 'elysia'
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
  .listen(34466)

app.get('/', () => 'Hello Elysia')

app.post(`/`, async ({ body, env }) => {
  const payload: any = body
  log('payload:', payload)

  // get the text of message
  const messageText = payload.message.text

  // get the telegram sender user id
  const userId = payload.from.id

  // generate reply message
  const replyText = `I have received your message!, you sent this:\n\n${messageText}`

  const replyPayload = {
    chat_id: userId,
    text: replyText,
  }

  // send reply message
  // documentation: https://core.telegram.org/bots/api#sendmessage
  const replyStatus = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'post',
    body: JSON.stringify(replyPayload),
    headers: {
      'Content-Type': 'application/json',
    },
  })

  log('replyStatus:', replyStatus)
})

// eslint-disable-next-line no-console
console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`)
