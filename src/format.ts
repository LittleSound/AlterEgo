import type { Message, MessageEntity, MessageOrigin } from 'grammy/types'
import { marked } from 'marked'

export function cleanAIResponse(text: string): string {
  // 清理 AI 回复开头的 [...]： 格式
  return text.replace(/^\s*\[[^\]]*\]:\s*/, '').trim()
}

export function convertToTelegramHtml(text: string): string {
  try {
    // 先用 marked 转换为标准 HTML
    let html = marked(text, {
      breaks: true,
      gfm: true,
    }) as string

    // console.log('----Original Text----\n', text, '\n--------------------------')
    // console.log('----Before HTML----\n', html, '\n--------------------------')

    html = ` ${html} `

    // 1) 换行
    html = html.replace(/<br\s*\/?>/gi, '\n')

    // 4) 相邻块之间用双换行表示分隔
    html = html.replace(/(<\/[^>]+>)\n(<[^>]+>)/g, '$1\n\n$2')

    // 2) 列表到纯文本
    html = html
      .replace(/<\/li>\s*/gi, '\n')
      .replace(/<li[^>]*>/gi, '• ')
      .replace(/<\/?ul[^>]*>/gi, '')

    // 3) 允许列表：把其它非白名单标签全部去掉，只留内容
    const whitelist = /<\/?([biu]|strong|em|ins|[sa]|strike|del|code|pre|tg-spoiler|span|blockquote)(\s[^>]*)?>/gi
    html = html
    // 暂存允许标签
      .replace(whitelist, m => `§§KEEP1§§${m}§§KEEP2§§`)
    // 去掉剩余所有标签
      .replace(/(?<!§§KEEP1§§)<[^>]+>(?!§§KEEP2§§)/g, '')
    // 还原允许标签
      .replace(/§§KEEP[12]§§/g, '')

    // 5) <span class="tg-spoiler"> -> <tg-spoiler>
    html = html.replace(/<span\s+class=["']tg-spoiler["']\s*>/gi, '<tg-spoiler>')
      .replace(/<\/span>/gi, '</tg-spoiler>')

    // console.log('----After HTML----\n', html, '\n--------------------------')

    return html.trim()
  }
  catch {
    // 如果转换失败，返回转义的纯文本
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }
}

/** 格式化消息 */
export function formatMessage(message: Message | undefined): string {
  if (!message) {
    return ''
  }

  const textlines: string[] = []
  const push = (line: string) => textlines.push(line)

  // 转发消息
  if (message.forward_origin) {
    push(`**Forwarded from: ${getMsgOriginName(message.forward_origin)}**`)
  }

  // 回复消息
  if (message.reply_to_message) {
    const replyMessage = message.reply_to_message
    const replyText = formatMsgText(replyMessage)

    push(`> **Replying to: ${formatName(replyMessage.from)}**`)
    push(`>`)

    if (replyMessage.forward_origin) {
      push(`> Forwarded from: ${getMsgOriginName(replyMessage.forward_origin)}`)
      push(`>`)
    }

    if (replyMessage.photo) {
      // TODO 图片处理
      // 可以只提供图片的访问 ID。然后提供一个工具调用让 AI 自己决定要不要访问图片。如果访问了就进行 OCR 识别，或者人让一个支持图片的大模型解释图片。
      push(`> Photos:`)
      push(`> The message includes ${replyMessage.photo.length} pictures (this client cannot display pictures).`)
      push(`>`)
    }

    if (replyText) {
      push(`> "${replyText.replace(/\n/g, '\n> ').trim().slice(0, 2000)}"`)
    }

    push('')
  }

  if (message.photo) {
    // TODO 图片处理
    // 可以只提供图片的访问 ID。然后提供一个工具调用让 AI 自己决定要不要访问图片。如果访问了就进行 OCR 识别，或者人让一个支持图片的大模型解释图片。
    push(`Photos: The message includes ${message.photo.length} pictures (this client cannot display pictures).`)
  }

  const text = formatMsgText(message)
  if (text) {
    push(text.trim())
  }

  return textlines.join('\n')
}

/** 格式化消息中的文本，包括富文本部分 */
export function formatMsgText(msg: Message): string {
  const { text, entities, caption, caption_entities: captionEntities } = msg
  // let result = msg.text || ''
  let result = ''
  if (text) {
    result += formatEntities(text, entities)
  }
  if (caption) {
    if (result)
      result += '\n\n'
    result += formatEntities(caption, captionEntities)
  }
  return result
}

function formatEntities(text: string, entities: MessageEntity[] = []): string {
  let lastOffset = 0
  let result = ''
  for (const entity of entities) {
    result += text.slice(lastOffset, entity.offset)
    if (entity.type === 'text_link') {
      result += `[${text.slice(entity.offset, entity.offset + entity.length)}](${entity.url})`
    }
    else if (entity.type === 'pre') {
      result += `\n\`\`\`${entity.language || ''}\n${text.slice(entity.offset, entity.offset + entity.length)}\n\`\`\`\n`
    }
    else {
      result += text.slice(entity.offset, entity.offset + entity.length)
    }
    lastOffset = entity.offset + entity.length
  }
  result += text.slice(lastOffset)
  return result
}

function getMsgOriginName(msgOrigin: MessageOrigin) {
  switch (msgOrigin.type) {
    case 'chat':
      return `${formatName(msgOrigin.sender_chat)}`
    case 'user':
      return `${formatName(msgOrigin.sender_user)}`
    case 'hidden_user':
      return `${msgOrigin.sender_user_name}`
    case 'channel':
      return `${formatName(msgOrigin.chat)}`
    default:
      return ''
  }
}

/** 格式化消息发送者的名称 */
export function formatName(options: { first_name?: string, last_name?: string, title?: string, username?: string } | undefined, rollback: string = 'User'): string {
  if (!options)
    return rollback

  const nameList: string[] = []
  const push = (name: string) => nameList.push(name)

  if (options.title) {
    push(`"${options.title}"`)
  }
  if (options.first_name || options.last_name) {
    push(`${options.first_name || ''} ${options.last_name || ''}`.trim())
  }
  if (options.username) {
    const list: string[] = []
    if (nameList.length)
      list.push('(')
    list.push(`@${options.username}`)
    if (nameList.length)
      list.push(')')
    nameList.push(list.join(''))
  }
  return nameList.join(' ')
}
