import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type { Context } from 'grammy'
import type { Message } from 'grammy/types'
import type { GroupChatSessionMemory, PrivateChatSessionMemory } from './memory'
import { streamText } from '@xsai/stream-text'
import { Elysia } from 'elysia'
import { Bot, GrammyError, webhookCallback } from 'grammy'
import { setupDatabase } from './database'
import { appEnvConfig } from './env'
import { cleanAIResponse, convertToTelegramHtml, formatMessage, formatName } from './format'
import { defineLogStreamed, error, getVerboseMode, log, setVerboseMode } from './log'
import { getGroupChatSession, getPrivateChatSession, getMemoryStats as getSessionMemoryStats } from './memory'
import { handleProbabilisticReply } from './probabilisticReply'
import { systemPrompt } from './prompt'
import { setupTools } from './tool'
import { getFormatedMemoriesMessage, getMemories, getMemorySyncStatus, remember, setMaxMemoryCount, setupMemoryDatabase } from './tool/memory'
import { invoke } from './utils'

const EDIT_MESSAGE_INTERVAL = 1000

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
      ctx.reply(convertToTelegramHtml('🤖 Hello. Hello. I am Alter Ego! I\'m a Chat Bot. You can say "Hi" with me.'))
    })

    bot.command('session', (ctx) => {
      const stats = getSessionMemoryStats()
      ctx.reply(convertToTelegramHtml(`📊 Memory Stats:\n• Active sessions: ${stats.sessionsCount}\n• Total messages: ${stats.totalMessages}\n\nI remember our conversations for today! 💭`))
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

    // 处理 @ 提及
    bot.on('message:entities').filter((ctx) => {
      if (!ctx.message?.text) {
        return false
      }
      // 检查是否提及了机器人
      const mentions = ctx.entities('mention')
      const isBotMentioned = mentions.some(
        entity => entity.text === `@${ctx.me.username}`,
      )
      return isBotMentioned
    }, (ctx) => {
      const session = getGroupChatSession(ctx.chat.id)
      handleTextMessage(ctx, {
        addUserMessage: content => session.addUserMessage(content, { userId: ctx.from?.id || 0, userName: formatName(ctx.from) }),
        addAssistantMessage: content => session.addAssistantMessage(content),
        session,
      })
    })

    // 处理回复消息
    bot.on('message').filter(ctx => !!(ctx.chat.type !== 'private' && ctx.msg.reply_to_message && ctx.msg.reply_to_message.from?.username === ctx.me.username && ctx.msg.text), (ctx) => {
      const session = getGroupChatSession(ctx.chat.id)
      handleTextMessage(ctx, {
        addUserMessage: content => session.addUserMessage(content, { userId: ctx.from?.id || 0, userName: formatName(ctx.from) }),
        addAssistantMessage: content => session.addAssistantMessage(content),
        session,
      })
    })

    // 回复私聊消息， 忽略转发的消息
    bot.on('message:text').filter(ctx => ctx.chat.type === 'private' && ctx.msg.forward_origin == null, (ctx) => {
      const userName = formatName(ctx.from)
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
    // 提及和回复此 Bot 的消息由上面的处理器处理并记录，所以这里不会包括
    bot.on('message:text').filter((ctx) => {
      return (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')
    }, (ctx) => {
      silentlyRecordMessage(ctx)

      // 尝试概率回复
      if (env.TALKATIVE_RANDOM_REPLY_ENABLED) {
        const result = handleProbabilisticReply(ctx, { envCoveredProbability: env.TALKATIVE_RANDOM_REPLY_COVERAGE_PROBABILITY })
        if (result.shouldReply && result.reply) {
          silentlyRecordMessage(ctx, { isAssistant: true })
        }
      }
    })

    // 记录所有未回应的消息
    bot.on('message').filter(ctx => !!ctx.message, ctx => silentlyRecordMessage(ctx))

    // AI 会默默记录下不回复的消息，直到需要回答时使用
    // 这样可以让 AI 了解群聊的上下文，但不会打扰到大家
    function silentlyRecordMessage(ctx: Context, options?: { isAssistant?: boolean }) {
      const requestMsgText = formatMessage(ctx.message)
      const userName = formatName(ctx.from)
      const userId = ctx.from?.id || 0
      const chatId = ctx.chat?.id
      const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup'

      if (!chatId)
        return

      const session = isGroup ? getGroupChatSession(chatId) : getPrivateChatSession(userId, userName, chatId)
      if (options?.isAssistant) {
        session.addAssistantMessage(requestMsgText)
      }
      else {
        session.addUserMessage(requestMsgText, { userId, userName })
      }

      if (isGroup)
        log(`[SILENT] ${userName} (${userId}) in ${ctx.chat?.title || 'group'}:`, requestMsgText)
      else
        log(`[SILENT] ${userName} (${userId}) in private chat:`, requestMsgText)
    }

    // 当 AI 收到用户的消息时，比如直接私聊，或者是在群里 @ 它，或者回复它
    // 它会通过这个函数给出答复，并且把对话记录存储到内存中
    // LLM 生成的消息会一点一点地发送给用户，就像流式传输一样
    function handleTextMessage(ctx: Context, option: {
      addUserMessage: (content: string) => void
      addAssistantMessage: (content: string) => void
      session: GroupChatSessionMemory | PrivateChatSessionMemory
    }) {
      if (!ctx.message || !ctx.chat?.id)
        return

      let theMsg: Message.TextMessage
      // 是否有 function calling
      let isWithWorking = false
      let isThinking = false

      const requestMsgText = formatMessage(ctx.message)
      const userName = formatName(ctx.from)
      const userId = ctx.from?.id || 0
      const replyTextList: string[] = []
      const toolCalls: { toolName: string, args: string }[] = []

      log(`[MSG] ${userName} (${userId}) in ${ctx.chat.type}:`, requestMsgText)

      // 回复的消息，修改这个值会直接发送或修改这条消息
      const replyMessage = invoke(() => {
        let value = ''
        let oldValue = ''

        let lastUpdateTime = 0
        let throttleTimer: Timer | null = null

        return {
          get value() {
            return value
          },
          set value(text: string) {
            if (!text || text.trim() === '')
              return
            value = convertToTelegramHtml(text)

            if (!theMsg && lastUpdateTime === 0) {
              newMessage(value)
              lastUpdateTime = Date.now()
              oldValue = value
              return
            }

            const now = Date.now()
            const timeSinceLastUpdate = now - lastUpdateTime

            if (timeSinceLastUpdate >= EDIT_MESSAGE_INTERVAL) {
              // 可以立即更新
              editMessage(value, oldValue)
              lastUpdateTime = now
              oldValue = value
            }
            else {
              if (!throttleTimer) {
                // 设置定时器，在下个时间窗口更新
                const delay = EDIT_MESSAGE_INTERVAL - timeSinceLastUpdate
                throttleTimer = setTimeout(() => {
                  if (value) {
                    editMessage(value, oldValue)
                    lastUpdateTime = Date.now()
                    oldValue = value
                  }
                  throttleTimer = null
                }, delay)
              }
            }
          },
        }

        async function newMessage(newValue: string) {
          // 如果是 @ 或回复，则回复原消息
          const shouldReplyToMessage = ctx.message?.text?.includes('@') || ctx.msg?.reply_to_message
          theMsg = await ctx.reply(newValue, {
            reply_parameters: shouldReplyToMessage && ctx.message?.message_id
              ? { message_id: ctx.message.message_id }
              : undefined,
            parse_mode: 'HTML',
          })
        }

        async function editMessage(newValue: string, oldValue: string) {
          if (newValue === oldValue)
            return

          try {
            await ctx.api.editMessageText(
              theMsg.chat.id,
              theMsg.message_id,
              newValue,
              { parse_mode: 'HTML' },
            )
          }
          catch (err) {
            // 忽略"内容未修改"的错误，这是正常的
            if (err instanceof GrammyError && err.description.includes('message is not modified')) {
              return
            }
            throw err
          }
        }
      })

      function getToolsLog() {
        return toolCalls.filter(Boolean).map((t) => {
          const args = t.args.length > 32 ? `${t.args.slice(0, 32)}...` : t.args
          return `⚙️ ${t.toolName} \`${args.replaceAll('\n', ' ').replaceAll('`', '')}\``
        }).join('\n')
      }

      function createReplyProcessText() {
        const cleanedPartial = replyTextList.length ? cleanAIResponse(replyTextList.join('')) : ''
        let text = ''
        if (isWithWorking) {
          text += `🟠 Working...\n${getToolsLog()}`
        }
        else if (isThinking && !cleanedPartial.length) {
          text += '🟢 Thinking...'
        }
        else {
          text += '🟢 Typing...'
        }
        if (cleanedPartial.length) {
          text += `\n\n${cleanedPartial}${'...'}`
        }
        return text
      }

      function handleError(err: unknown) {
        error('Error processing message:', err)
        const errorText = '🔴 Something went wrong. I don\'t know what to say next...'
        if (theMsg) {
          const hasSomeMessage = replyTextList.length > 0 || toolCalls.length > 0
          const finalErrorMsg = hasSomeMessage
            ? `${createReplyProcessText()}\n\n${errorText}`
            : errorText

          // 让 AI 知道自己出错了。用户问的时候，AI 可以回答为什么出错了。
          option.addAssistantMessage(err instanceof Error
            ? `${finalErrorMsg}\n\nAlter Ego System Error Log: ${err.toString()}`
            : finalErrorMsg,
          )
          replyMessage.value = finalErrorMsg
        }
        else {
          // 让 AI 知道自己出错了。用户问的时候，AI 可以回答为什么出错了。
          option.addAssistantMessage(err instanceof Error
            ? `${errorText}\n\nAlter Ego System Error Log: ${err.toString()}`
            : errorText,
          )
          replyMessage.value = errorText
        }
      }

      invoke(async () => {
        replyMessage.value = '🔵 Connecting...'

        option.addUserMessage(requestMsgText)
        const chatHistory = option.session.toMessages()
        const messages = systemPrompt({ userName, chatType: ctx.chat?.type })
        const memories = getFormatedMemoriesMessage(userId, userName)
        if (memories)
          messages.push(memories)
        messages.push(...chatHistory)

        const { textStream } = streamText({
          apiKey: env.AI_OPENROUTER_API_KEY!,
          baseURL: env.AI_OPENROUTER_BASE_URL,
          messages,
          model: env.AI_LLM_DEFAULT_MODEL,
          maxSteps: env.AI_LLM_MAX_STEPS,
          tools: [
            ...aiTools,
            await remember({ userId }),
          ],
          onEvent(event) {
            if (!isWithWorking && event.type === 'tool-call-delta') {
              isWithWorking = true
            }
            if (!isThinking && event.type === 'text-delta' && event.text === '') {
              isThinking = true
            }
            if (event.type !== 'tool-call') {
              return
            }
            isWithWorking = true

            log(`[TOOL] Calling tool: ${event.toolName} with args: ${event.args}`)
            toolCalls.push({ toolName: event.toolName, args: event.args })

            replyMessage.value = createReplyProcessText()
          },
        })

        const writeLog = defineLogStreamed('[REPLY] Alter Ego: ')
        for await (const textPart of textStream) {
          replyTextList.push(textPart)
          writeLog(textPart)

          replyMessage.value = createReplyProcessText()
        }
        writeLog('\n')

        const finalResponse = cleanAIResponse(replyTextList.join(''))
        // log(`[REPLY] Alter Ego:`, finalResponse)
        option.addAssistantMessage(finalResponse)
        replyMessage.value = isWithWorking
          ? `☑️ Done working\n${finalResponse}`
          : finalResponse
      }).catch(async (err) => {
        handleError(err)
      }).finally(() => {
        // 输出内存统计
        if (!getVerboseMode())
          return
        try {
          const stats = getSessionMemoryStats()
          log(`[MEMORY] Sessions: ${stats.sessionsCount}, Total messages: ${stats.totalMessages}`)
        }
        catch (err) {
          error('Unexpected error when processing message:', err)
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
