import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { Elysia } from 'elysia'
import { Bot, webhookCallback } from 'grammy'
import { replyMessageWithAI } from './ai'
import { setupDatabase } from './database'
import { appEnvConfig } from './env'
import { convertToTelegramHtml } from './format'
import { setVerboseMode } from './log'
import { shouldReplyProbabilistically } from './probabilisticReply'
import { getSessionByCtx, getSessionMemoryStats, recordMessage, recordText } from './session'
import { setupTools } from './tool'
import { getMemories, getMemorySyncStatus, setMaxMemoryCount, setupMemoryDatabase } from './tool/memory'

let theBot: Bot
let theDatabase: PostgresJsDatabase | null = null
let theAiTools: ReturnType<typeof setupTools> extends Promise<infer R> ? R : never

const app = new Elysia()
  .use(appEnvConfig)
  // setup database
  .derive(({ env }) => {
    if (!env.POSTGRESQL_DATABASE_URL) {
      return { database: null }
    }
    if (theDatabase) {
      return { database: theDatabase }
    }
    const { database } = setupDatabase({ databaseUrl: env.POSTGRESQL_DATABASE_URL })
    theDatabase = database
    setupMemoryDatabase(database)
    return { database }
  })
  // setup app status
  .derive(({ env }) => {
    setVerboseMode(env.VERBOSE)
    setMaxMemoryCount(env.AI_MEMORY_MAX_COUNT)
  })
  // setup AI tools
  .derive(async ({ env }) => {
    if (theAiTools) {
      return { aiTools: theAiTools }
    }
    const aiTools = theAiTools = await setupTools(env)
    return { aiTools }
  })
  .derive(({ env, aiTools }) => {
    if (theBot) {
      return { bot: theBot }
    }
    const bot = theBot = new Bot(env.TELEGRAM_BOT_TOKEN)

    bot.command('start', (ctx) => {
      ctx.reply(convertToTelegramHtml('🤖 Hello. Hello. I am Alter Ego! I am a Chat Bot. You can say Hi with me.'), { parse_mode: 'HTML' })
    })

    bot.command('session', (ctx) => {
      const stats = getSessionMemoryStats()
      ctx.reply(convertToTelegramHtml(`📊 Memory Stats:\n• Active sessions: ${stats.sessionsCount}\n• Total messages: ${stats.totalMessages}\n\nI remember our conversations for today! 💭`), { parse_mode: 'HTML' })
    })

    bot.command('memory', (ctx) => {
      if (!ctx.from?.id) {
        ctx.reply('⚠️ Cannot get your user ID.')
        return
      }
      const memories = getMemories(ctx.from?.id || 0)
      let replyText = `💾 Your Memories (${memories.length}):`

      const isSynced = getMemorySyncStatus()
      replyText += isSynced ? '' : ' *(Non-synchronized state)*'

      replyText += `\n\n`
      if (memories.length) {
        const memoriesListString = memories.map((m, i) => {
          return `> **📝 Note ${i + 1}**\n> ${m.text.replaceAll('\n', '\n> ')}`
        }).join('\n\n')
        replyText += memoriesListString
      }
      else {
        replyText += 'No memories yet.'
      }
      ctx.reply(convertToTelegramHtml(replyText), { parse_mode: 'HTML' })
    })

    bot.command('clear', (ctx) => {
      if (ctx.chat?.type !== 'private') {
        ctx.reply('⚠️ Context can only be cleared in private chats.')
        return
      }

      ctx.reply('**🧹 Context cleared**')
      const session = getSessionByCtx(ctx)
      if (session) {
        session.clear()
      }
    })

    // 处理 @ 提及
    bot.on('message:entities').filter((ctx) => {
      if (!ctx.msg) {
        return false
      }
      // 检查是否提及了机器人
      const mentions = ctx.entities('mention')
      const isBotMentioned = mentions.some(
        entity => entity.text === `@${ctx.me.username}`,
      )
      return isBotMentioned
    }, (ctx) => {
      replyMessageWithAI({ ctx, env, aiTools })
    })

    // 处理回复消息
    bot.on('message').filter(ctx => !!(ctx.chat.type !== 'private' && ctx.msg.reply_to_message && ctx.msg.reply_to_message.from?.username === ctx.me.username && ctx.msg.text), (ctx) => {
      replyMessageWithAI({ ctx, env, aiTools })
    })

    // 回复私聊消息， 忽略转发的消息
    bot.on('message:text').filter(ctx => ctx.chat.type === 'private' && ctx.msg.forward_origin == null, (ctx) => {
      replyMessageWithAI({ ctx, env, aiTools })
    })

    // 群聊中的普通消息 - 仅记录，不回复（需要机器人是管理员）
    // 提及和回复此 Bot 的消息由上面的处理器处理并记录，所以这里不会包括
    bot.on('message:text').filter((ctx) => {
      return (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')
    }, (ctx) => {
      recordMessage(ctx.msg)

      // 尝试概率回复
      if (env.TALKATIVE_RANDOM_REPLY_ENABLED && ctx.msg && (ctx.msg.text || ctx.msg.caption)) {
        const result = shouldReplyProbabilistically(ctx.msg.text || ctx.msg.caption || '', { envCoveredProbability: env.TALKATIVE_RANDOM_REPLY_COVERAGE_PROBABILITY })
        if (result.shouldReply && result.reply) {
          // 如果开启了生成消息，则使用 AI 回复,否则用一些配置好的随机内容来回复
          if (env.TALKATIVE_RANDOM_REPLY_GEN_MESSAGE_ENABLED) {
            replyMessageWithAI({ ctx, env, aiTools })
          }
          else {
            ctx.reply(result.reply, {
              reply_parameters: ctx.msg?.message_id
                ? { message_id: ctx.msg.message_id }
                : undefined,
            })
            recordText(ctx, result.reply, { isAssistant: true })
          }
        }
      }
    })

    // 记录所有未回应的消息
    bot.on('message').filter(ctx => !!ctx.msg, ctx => recordMessage(ctx.msg))

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
