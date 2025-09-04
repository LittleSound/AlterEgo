# Telegram AI Bot

一个使用 grammY + ElysiaJS + Bun 构建的现代化 Telegram 机器人。

## 🚀 特性

- **grammY**: 现代化的 Telegram Bot 框架，提供完整的 TypeScript 支持
- **ElysiaJS**: 高性能 Web 框架，专为 Bun 优化
- **Bun**: 极速的 JavaScript 运行时
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
```

2. 从 [@BotFather](https://t.me/BotFather) 获取 bot token

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
- 文本消息回复 - 智能回复用户消息
- 错误处理 - 处理非文本消息

## 🏗️ 架构

这个项目展示了如何将现代化的技术栈结合：

- **grammY** 处理 Telegram Bot API 交互
- **ElysiaJS** 提供高性能的 HTTP 服务器
- **Webhook** 方式接收 Telegram 更新
- **TypeScript** 提供类型安全

## 🔗 Webhook 设置

对于生产环境，需要设置 webhook：

```bash
curl -X POST \
  https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook \
  -H "Content-Type: application/json" \
  -d '{"url": "https://your-domain.com/"}'
```

## 📚 技术文档

- [grammY 文档](https://grammy.dev/)
- [ElysiaJS 文档](https://elysiajs.com/)
- [Bun 文档](https://bun.sh/docs)
