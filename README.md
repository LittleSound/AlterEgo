# Alter Ego Telegram AI Bot

一个使用 grammY + ElysiaJS + Bun 构建的现代化 Telegram 机器人。

## 🚀 特性

- **grammY**: 现代化的 Telegram Bot 框架，提供完整的 TypeScript 支持
- **ElysiaJS**: 高性能 Web 框架，专为 Bun 优化
- **Bun**: 极速的 JavaScript 运行时
- **xsAI**: 超轻量级 AI SDK (< 6KB)，支持文本生成和流式输出
- **Webhook 模式**: 支持生产环境部署

## 📦 安装

```bash
# 克隆项目
git clone <your-repo>
cd telegram-ai-bot

# 安装依赖
bun install
```

## 🔧 配置

1. 创建 `.env.local` 文件：
```bash
TELEGRAM_BOT_TOKEN=your_bot_token_here
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_BASE_URL=https://api.openai.com/v1/
```

2. 从 [@BotFather](https://t.me/BotFather) 获取 bot token
3. 从 [OpenAI](https://platform.openai.com/api-keys) 获取 API key

## 🏃‍♂️ 运行

```bash
# 开发模式
bun run dev

# 代码检查
bun run lint

# 代码修复
bun run lint:fix
```

## 🤖 Bot 功能

- `/start` - 欢迎消息
- 文本消息回复 - 使用 AI 智能回复用户消息
- 流式响应 - 实时显示 AI 生成的文本
- 错误处理 - 处理非文本消息

## 🧠 AI 集成

使用 **xsAI** SDK 提供强大的 AI 功能：

```typescript
import { streamText } from '@xsai/stream-text'

const { textStream } = await streamText({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL,
  messages: [
    { role: 'system', content: 'You are a helpful assistant.' },
    { role: 'user', content: userMessage }
  ],
  model: 'gpt-4o'
})

// 流式响应处理
for await (const textPart of textStream) {
  // 实时更新回复
}
```

### xsAI 特性
- 🚀 超轻量级：相比其他 SDK，安装大小减少 100 倍，打包大小减少 12 倍
- 📦 模块化：只安装需要的功能包
- 🔧 兼容性：支持任何 OpenAI 兼容的 API
- 💾 极小体积：`@xsai/generate-text` 仅 21KB 安装大小，3.5KB 打包大小

## 🏗️ 架构

这个项目展示了如何将现代化的技术栈结合：

- **grammY** 处理 Telegram Bot API 交互
- **ElysiaJS** 提供高性能的 HTTP 服务器
- **xsAI** 提供轻量级 AI 文本生成能力
- **Webhook** 方式接收 Telegram 更新
- **TypeScript** 提供类型安全
- **Bun** 运行时优化性能

## 🔗 Webhook 设置

对于生产环境，需要设置 webhook：

```bash
curl -X POST \
  https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-domain.com/"}'
```

## 📚 技术文档

- [grammY 文档](https://grammy.dev/) - Telegram Bot 框架
- [ElysiaJS 文档](https://elysiajs.com/) - 高性能 Web 框架
- [xsAI 文档](https://xsai.js.org/docs) - 轻量级 AI SDK
- [Bun 文档](https://bun.sh/docs) - JavaScript 运行时

## 🔗 相关链接

- [xsAI GitHub](https://github.com/moeru-ai/xsai) - 源码仓库
- [xsAI 介绍博客](https://blog.moeru.ai/introducing-xsai/) - 详细介绍
- [Telegram Bot API](https://core.telegram.org/bots/api) - 官方文档
