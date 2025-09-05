import { marked } from 'marked'

export function cleanAIResponse(text: string): string {
  // 清理 AI 回复开头的 [...]： 格式
  return text.replace(/^\s*\[[^\]]*\]:\s*/, '')
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
