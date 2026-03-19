
# PixelDemo 项目上下文 - 重要技术备忘

## 项目概述
Phaser.js 像素风小镇游戏，当前只有一个 AI NPC：社区民警**老刘**（贴图用 npc1）。
目标：先把老刘做完美，再加其他 NPC。

## API 信息
- **Endpoint**: `https://api.qnaigc.com/v1/chat/completions`
- **Model**: `minimax/minimax-m1` （或 minimax-m2.1，以 .env 为准）
- **Key**: 存在 `.env` → `AI_API_KEY=...`，通过 `vite.config.js` 的 `define` 注入为 `process.env.AI_API_KEY`
- **绝对不能**把 key 提交到 git（`.gitignore` 已配置）

## 关键文件
| 文件 | 作用 |
|------|------|
| `src/game/MainScene.ts` | 主场景，对话框UI、分页滚动逻辑全在这 |
| `src/agents/SimplePoliceNPC.ts` | 老刘的行为逻辑（巡逻/休息/对话） |
| `src/agents/PoliceNPCIntegration.ts` | 警察NPC系统初始化入口 |
| `src/utils/AIService.ts` | API 调用封装，含 429 限流保护 |

## 已踩的坑（最重要）

### 1. 对话框分页：必须用 Canvas measureText，不能估算字符宽度
`buildVisualLines()` 用 `ctx.measureText()` 逐字精确折行。
Phaser `dialogText` 的字体必须和 measureText 用同一字体：`14px sans-serif`。
**禁用 Phaser 的 `wordWrap`**，折行由 JS 控制后直接传 `\n` 连接的字符串。

```ts
// dialogText 配置
fontSize: '14px', fontFamily: 'sans-serif'
// 不要写 wordWrap！
```

### 2. 聊天框滚动：按「视觉行」分页，不是按「消息条数」
- `chatHistory[]` 存原始消息，**永不截断**
- `buildVisualLines()` 把所有消息按像素折成视觉行数组
- `chatScrollOffset` 是行偏移（不是消息偏移）
- 每次滚轮滚动 2 行，新消息到达自动归 0（滚回底部）
- `CHAT_VISIBLE_LINES = 9`（对话框可用高度 210px / 行高 20px）

### 3. AI 调用防 429：必须有 isDeciding 标志 + 冷却时间
`SimplePoliceNPC.update()` 每帧都会调用，不加节流会瞬间耗尽配额。
```ts
if (this.isDeciding) return;
if (now - this.lastDecisionTime < 60000) return; // 60秒冷却
```
`AIService` 收到 429 后会设置 `retryAfter` 时间戳，期间所有请求直接拒绝。

### 4. 初始化时禁止测试对话
`PoliceNPCIntegration.ts` 里**不要**在初始化时调用 `handlePlayerDialog('测试')`，
每次游戏启动都会白白消耗一次 API 配额。

### 5. 消息存入历史前必须清理换行符
AI 回复里含 `\n`，如果直接存入 `chatHistory`，后续 `buildVisualLines` 折行会乱。
```ts
content = message.replace(/\r?\n/g, ' ').trim();
```

### 6. "思考中..."替换逻辑
发送消息时先插入 `老刘: （思考中...）`，收到回复后用 `replaceLastMessage()` 原地替换，
不是 `addChatMessage`（否则会出现两条老刘的消息）。

### 7. updateDepthSorting 不能删
`MainScene.ts` 里有 `updateDepthSorting()` 方法，管理玩家/NPC 的渲染层级。
编辑这个文件时**一定不能误删这个方法**，删了会黑屏。

## 对话框尺寸（别再改了）
```
dialogHeight = 320px
文字区域高 = 210px（320 - 35顶部 - 75底部输入框区域）
输入框 inputBoxY = dialogY + dialogHeight - 45
```

## 当前状态
老刘可以正常对话、分页滚动查看历史，429 已压制。下一步：打磨老刘性格/背景，再加其他 NPC。
