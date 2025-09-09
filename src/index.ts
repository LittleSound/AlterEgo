import type { Context } from 'grammy'
import type { Message } from 'grammy/types'
import type { GroupChatSessionMemory, PrivateChatSessionMemory } from './memory'
import { streamText } from '@xsai/stream-text'
import { Elysia } from 'elysia'
import { Bot, webhookCallback } from 'grammy'
import { appEnvConfig } from './env'
import { cleanAIResponse, convertToTelegramHtml, formatRequestMessage } from './format'
import { error, getVerboseMode, log, setVerboseMode } from './log'
import { getGroupChatSession, getMemoryStats, getPrivateChatSession } from './memory'
import { systemPrompt } from './prompt'
import { invoke } from './utils'

const EDIT_MESSAGE_INTERVAL = 1000

const app = new Elysia()
  .use(appEnvConfig)
  .derive(({ env }) => {
    const bot = new Bot(env.TELEGRAM_BOT_TOKEN)

    setVerboseMode(env.VERBOSE)

    bot.command('start', (ctx) => {
      ctx.reply(convertToTelegramHtml('🤖 Hello. Hello. I am Alter Ego! I\'m a Chat Bot. You can say "Hi" with me.'), { parse_mode: 'HTML' })
    })

    bot.command('memory', (ctx) => {
      const stats = getMemoryStats()
      ctx.reply(convertToTelegramHtml(`📊 Memory Stats:\n• Active sessions: ${stats.sessionsCount}\n• Total messages: ${stats.totalMessages}\n\nI remember our conversations for today! 💭`), { parse_mode: 'HTML' })
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
        addUserMessage: content => session.addUserMessage(content, { userId: ctx.from?.id || 0, userName: ctx.from?.first_name || 'User' }),
        addAssistantMessage: content => session.addAssistantMessage(content),
        session,
      })
    })

    // 不是 @ 自己的消息，那就默默记录下来吧
    bot.on('message:entities', ctx => silentlyRecordMessage(ctx))

    // 处理回复消息
    bot.on('message').filter(ctx => !!(ctx.chat.type !== 'private' && ctx.msg.reply_to_message && ctx.msg.reply_to_message.from?.username === ctx.me.username && ctx.msg.text), (ctx) => {
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
    // 提及和回复此 Bot 的消息由上面的处理器处理并记录，所以这里不会包括
    bot.on('message:text').filter((ctx) => {
      return (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')
    }, ctx => silentlyRecordMessage(ctx))

    // AI 会默默记录下群聊中的消息，直到有人 @ 它 或 回复它 才会进行回答
    // 这样可以让 AI 了解群聊的上下文，但不会打扰到大家
    function silentlyRecordMessage(ctx: Context) {
      if (!ctx.message?.text)
        return

      const requestMsgText = formatRequestMessage(ctx)
      const userName = ctx.from?.first_name || 'User'
      const userId = ctx.from?.id || 0
      const chatId = ctx.chat?.id

      if (!chatId)
        return

      const session = getGroupChatSession(chatId)
      session.addUserMessage(requestMsgText, { userId, userName })

      log(`[SILENT] ${userName} (${userId}) in ${ctx.chat?.title || 'group'}:`, requestMsgText)
    }

    // 当 AI 收到用户的消息时，比如直接私聊，或者是在群里 @ 它，或者回复它
    // 它会通过这个函数给出答复，并且把对话记录存储到内存中
    // LLM 生成的消息会一点一点地发送给用户，就像流式传输一样
    function handleTextMessage(ctx: Context, option: {
      addUserMessage: (content: string) => void
      addAssistantMessage: (content: string) => void
      session: GroupChatSessionMemory | PrivateChatSessionMemory
    }) {
      if (!ctx.message?.text || !ctx.chat?.id)
        return

      let theMsg: Message.TextMessage
      let lastTime = Date.now()

      const requestMsgText = formatRequestMessage(ctx)
      const userName = ctx.from?.first_name || 'User'
      const userId = ctx.from?.id || 0
      const replyTextList: string[] = []

      log(`[MSG] ${userName} (${userId}) in ${ctx.chat.type}:`, requestMsgText)

      // 回复的消息，修改这个值会直接发送或修改这条消息
      const replyMessage = invoke(() => {
        let value = ''
        return {
          get value() {
            return value
          },
          set value(text: string) {
            const oldValue = value
            value = convertToTelegramHtml(text)
            if (theMsg)
              editMessage(value, oldValue)
            else
              newMessage(value)
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
          await ctx.api.editMessageText(
            theMsg.chat.id,
            theMsg.message_id,
            newValue,
            { parse_mode: 'HTML' },
          )
        }
      })

      invoke(async () => {
        replyMessage.value = '🔵 Connecting...'

        option.addUserMessage(requestMsgText)
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
            replyMessage.value = `${'🟢 Typing...'}\n\n${cleanedPartial}${'...'}`
          }
        }

        const finalResponse = cleanAIResponse(replyTextList.join(''))
        log(`[REPLY] Alter Ego:`, finalResponse)
        option.addAssistantMessage(finalResponse)
        replyMessage.value = finalResponse
      }).catch(async (err) => {
        error('Error processing message:', err)
        const errorText = '🔴 Something went wrong. I don\'t know what to say next...'
        if (theMsg) {
          const partialResponse = replyTextList.length > 0
            ? cleanAIResponse(replyTextList.join(''))
            : ''
          const finalErrorMsg = partialResponse
            ? `${partialResponse}\n\n${errorText}`
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
      }).finally(() => {
        // 输出内存统计
        if (!getVerboseMode())
          return
        try {
          const stats = getMemoryStats()
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
