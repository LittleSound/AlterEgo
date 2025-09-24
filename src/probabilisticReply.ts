import { log } from './log'

interface ReplyPattern {
  name?: string
  pattern: RegExp
  replies: string[]
  probability: number
}

const replyPatterns: ReplyPattern[] = [
  { // foo是bar吗？
    name: 'foo是bar吗？',
    pattern: /是.*?[吗吧嘛][？?]?$/,
    replies: [
      // 肯定
      '是的呢～',
      '当然啦！',
      '嗯嗯，没错',
      '应该是吧...',
      '你说得对！',
      '确实如此',
      '是这样的～',
      // 否定
      '不是哦',
      '好像不是',
      '可能不是吧...',
      '不太可能是',
      '不见得呢～',
      // 中立
      '说不准呢',
      '看情况吧',
      '见仁见智',
      '不知道哦～',
      '我也不清楚',
    ],
    probability: 0.25,
  },
  { // 有foo吗？
    name: '有foo吗？',
    pattern: /有.+[吗吧嘛][？?]?$/,
    replies: [
      // 肯定
      '有的哦～',
      '当然有啦！',
      '应该有吧...',
      '肯定有的！',
      '嗯嗯，有的',
      '当然～',
      // 否定
      '没有哦',
      '好像没有',
      '可能没有吧...',
      '不太可能有',
      // 中立
      '说不准呢',
      '看情况吧',
      '不知道哦～',
      '我也不清楚',
    ],
    probability: 0.2,
  },
  { // 看看foo
    name: '看看foo',
    pattern: /看看.+/,
    replies: [
      '👀 让我康康...',
      '好的，我看看～',
      '👁️ 瞧瞧',
      '🔍 我来看看',
      '让我瞅瞅',
      '👁️‍🗨️ 看看看',
    ],
    probability: 0.2,
  },
  { // 是不是foo
    name: '是不是foo',
    pattern: /是不是.+$/,
    replies: [
      // 肯定
      '应该是的吧',
      '嗯嗯，是的',
      '好像是这样',
      '确实是呢',
      '没错哦～',
      '你说得对',
      // 否定
      '不太像吧',
      '好像不是',
      '可能不是哦',
      '不见得呢～',
      '未必哦',
      // 中立
      '说不准呢',
      '看情况吧',
      '见仁见智',
      '不知道哦～',
      '我也不清楚',
    ],
    probability: 0.25,
  },
  { // foo真的假的?
    name: 'foo真的假的?',
    pattern: /真的假的[？?]?$/,
    replies: [
      '当然是真的啦！',
      '假的，骗你的～',
      '你猜猜看',
      '半真半假吧',
      '这个... 保密～',
    ],
    probability: 0.3,
  },
  { // foo好bar吗？
    name: 'foo好bar吗？',
    pattern: /好.*?(吗|嘛)[？?]?$/,
    replies: [
      '好呀好呀！',
      '当然好啦～',
      '挺好的',
      '还不错哦',
      '非常好！',
      '超级好的～',
      // 否定
      '没那么好',
      '一般般吧',
      '不太好',
      '不怎么样',
      '有点失望',
      //  中立
      '还行吧',
      '看情况',
      '因人而异',
      '见仁见智',
      '各有各的好',
    ],
    probability: 0.2,
  },
  {
    name: '为什么',
    pattern: /为什么.+$/,
    replies: [
      '因为... 就是因为！',
      '这个问题很深奥呢',
      '🤔 让我想想... 想不出来 😵',
      '可能是缘分吧',
      '谁知道呢～',
      '这就是生活啊',
    ],
    probability: 0.15,
  },
]

export function shouldReplyProbabilistically(text: string, options: { envCoveredProbability?: number }): { shouldReply: boolean, reply?: string } {
  // 清理文本，移除 @ 提及
  const cleanText = text.replace(/@\w+/g, '').trim()

  for (let { pattern, replies, probability, name } of replyPatterns) {
    if (pattern.test(cleanText)) {
      if (options.envCoveredProbability != null && options.envCoveredProbability !== -1) {
        probability = options.envCoveredProbability
      }
      const randomFactor = Math.random()
      const isWantedToReply = randomFactor < probability

      log(`[Talkative] ${isWantedToReply ? '✅' : '❌'} Pattern matched: ${name || pattern}, Random factor: ${randomFactor}, Probability: ${probability}`)

      if (isWantedToReply) {
        const randomReply = replies[Math.floor(Math.random() * replies.length)]
        return { shouldReply: true, reply: randomReply }
      }
    }
  }

  return { shouldReply: false }
}
