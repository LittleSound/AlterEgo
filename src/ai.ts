import type { Context } from 'grammy'
import type { Message } from 'grammy/types'
import type { Tool } from 'xsai'
import type { AppEnv } from './env'
import { GrammyError } from 'grammy'
import { streamText } from 'xsai'
import { cleanAIResponse, convertToTelegramHtml, formatMessage, formatName } from './format'
import { defineLogStreamed, error, getVerboseMode, log } from './log'
import { systemPrompt } from './prompt'
import { getChatHistory, getSessionMemoryStats, recordAssistantText, recordUserText } from './session'
import { getFormatedMemoriesMessage, remember } from './tool/memory'
import { invoke } from './utils'

const EDIT_MESSAGE_INTERVAL = 1000

// 当 AI 收到用户的消息时，比如直接私聊，或者是在群里 @ 它，或者回复它
// 它会通过这个函数给出答复，并且把对话记录存储到内存中
// LLM 生成的消息会一点一点地发送给用户，就像流式传输一样
export function replyMessageWithAI(options: {
  ctx: Context
  env: AppEnv
  aiTools: Tool[]
}) {
  const { ctx, env, aiTools } = options

  const requestMsg = ctx.msg

  if (!requestMsg || !ctx.chat?.id)
    return

  let theMsg: Message.TextMessage
  // 是否有 function calling
  let isWithWorking = false
  let isThinking = false

  const requestMsgText = formatMessage(requestMsg)
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
      try {
        // 如果是 @ 或回复，则回复原消息
        const shouldReplyToMessage = requestMsg?.text?.includes('@') || requestMsg?.reply_to_message
        theMsg = await ctx.reply(newValue, {
          reply_parameters: shouldReplyToMessage && requestMsg?.message_id
            ? { message_id: requestMsg.message_id }
            : undefined,
          parse_mode: 'HTML',
        })
      }
      catch (err) {
        // 用户可能屏蔽了机器人，或其他发送消息失败的情况
        if (err instanceof GrammyError && err.error_code === 403) {
          error('User blocked the bot:', userId)
          return
        }
        throw err
      }
    }

    async function editMessage(newValue: string, oldValue: string) {
      if (newValue === oldValue)
        return

      if (!theMsg) {
        error('Cannot edit message: theMsg is undefined')
        return
      }

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
      recordAssistantText(ctx, err instanceof Error
        ? `${finalErrorMsg}\n\nAlter Ego System Error Log: ${err.toString()}`
        : finalErrorMsg)
      replyMessage.value = finalErrorMsg
    }
    else {
      // 让 AI 知道自己出错了。用户问的时候，AI 可以回答为什么出错了。
      recordAssistantText(ctx, err instanceof Error
        ? `${errorText}\n\nAlter Ego System Error Log: ${err.toString()}`
        : errorText)
      replyMessage.value = errorText
    }
  }

  invoke(async () => {
    replyMessage.value = '🔵 Connecting...'

    recordUserText(ctx, requestMsgText)
    const chatHistory = getChatHistory(ctx)
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
    recordAssistantText(ctx, finalResponse)
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
