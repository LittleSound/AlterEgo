# Telegram AI Bot - Claude Code 记忆文件

## 项目概览

这是一个现代化的 Telegram AI 机器人项目，使用了2025年最新最热门的技术栈。

## 🛠️ 技术栈

### 核心框架
- **grammY (v1.38.2)**: 现代化的 Telegram Bot 框架，2025年最推荐的选择
  - 提供完整的 TypeScript 支持
  - 支持 webhook 和 长轮询 两种模式
  - 当前使用 webhook 模式集成到 ElysiaJS

- **ElysiaJS (latest)**: 高性能 Web 框架
  - 专为 Bun 运行时优化
  - 支持高达 21x 于 Express 的性能
  - 使用 `webhookCallback(bot, 'std/http')` 与 grammY 集成

- **Bun**: JavaScript 运行时
  - 比 Node.js 更快的启动速度和执行性能
  - 原生 TypeScript 支持

### AI 能力
- **xsAI (v0.4.0-beta.3)**: 超轻量级 AI SDK
  - 安装大小比其他 SDK 小 100 倍
  - 打包大小比其他 SDK 小 12 倍
  - 支持 OpenAI 兼容的任何 API
  - 主要包：`@xsai/generate-text`, `@xsai/stream-text`

## 📁 项目结构

```
telegram-ai-bot/
├── src/
│   ├── index.ts          # 主应用文件，集成 grammY + ElysiaJS
│   └── log.ts           # 日志工具函数
├── package.json         # 依赖管理
├── README.md           # 项目文档
└── CLAUDE.md           # Claude Code 记忆文件
```

## 🔧 核心实现

### Bot 初始化和路由
```typescript
// src/index.ts 关键代码模式
const app = new Elysia()
  .use(env({
    TELEGRAM_BOT_TOKEN: t.String({ minLength: 40 }),
  }))
  .derive(({ env }) => {
    const bot = new Bot(env.TELEGRAM_BOT_TOKEN)
    // Bot 处理逻辑
    return { bot }
  })
  .post('/', async ({ request, bot }) => {
    const callback = webhookCallback(bot, 'std/http')
    return await callback(request)
  })
```

### 环境变量配置
需要在 `.env.local` 中设置：
```bash
TELEGRAM_BOT_TOKEN=xxx
OPENAI_API_KEY=xxx  # 用于 xsAI
OPENAI_BASE_URL=https://api.openai.com/v1/
```

## 🚀 开发命令

- `bun run dev` - 启动开发服务器 (端口 34466)
- `bun run lint` - 代码检查
- `bun run lint:fix` - 自动修复代码问题

## 🤖 Bot 功能

1. **基础消息处理**
   - `/start` 命令响应
   - `/memory` 内存统计查看
   - 文本消息智能回复
   - 非文本消息错误提示

2. **群聊支持** (解决隐私模式问题)
   - 支持 `@bot_name` 提及响应
   - 支持回复机器人消息
   - 自动清理消息中的 @ 提及文本
   - 私聊和群聊分别处理

3. **AI 集成能力** (通过 xsAI)
   - 文本生成：`generateText()`
   - 流式响应：`streamText()`
   - 支持任何 OpenAI 兼容 API

4. **聊天记忆功能**
   - 按用户和日期存储对话历史
   - 每个会话最多20条消息
   - 自动清理7天前的旧会话
   - 内存使用统计

## 📋 开发注意事项

### 代码风格
- 使用 `@antfu/eslint-config` 进行代码规范
- TypeScript 严格模式
- ESM 模块格式

### 集成模式
- 使用 `.derive()` 方法在 ElysiaJS 中共享 bot 实例
- Webhook 模式部署，适合生产环境
- 通过 `webhookCallback` 将 grammY 适配到标准 HTTP 请求

### 性能优化
- xsAI 提供极小的打包体积
- Bun 运行时提供更快的启动和执行速度
- ElysiaJS 的高性能 HTTP 处理

## 🔗 重要链接

- [grammY 文档](https://grammy.dev/)
- [ElysiaJS 文档](https://elysiajs.com/)
- [xsAI 文档](https://xsai.js.org/docs)
- [xsAI GitHub](https://github.com/moeru-ai/xsai)

## 📝 更新记录

- **2025-09-04**:
  - 项目初始化
  - 集成 grammY + ElysiaJS + xsAI
  - 实现基础 webhook 机器人功能
  - 添加完整文档和记忆文件
