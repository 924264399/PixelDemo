# 多NPC扩展架构设计文档

## 🎯 设计目标

为Pixel Town Demo项目预留完整的多NPC扩展架构，支持从单NPC到多NPC的平滑扩展，确保：

1. **单NPC完善时**代码架构已就绪
2. **多NPC扩展时**改动最小，风险最低
3. **AI功能集成**有完整的LangChain.js预留接口
4. **性能和成本**得到合理控制

## 📁 架构文件说明

### 1. NPCManager.ts - 多NPC管理核心

**功能**：
- 统一管理所有NPC实例
- 协调NPC间的通信和社交
- 管理共享知识库
- 优化LLM API调用频率
- 处理NPC间的碰撞避让

**核心类**：
- `NPCManager` - 单例模式的NPC管理器
- `NPCCommunicationAPI` - 便利的通信接口

**使用场景**：
```typescript
// 注册NPC
const manager = NPCManager.getInstance();
manager.registerNPC(npc, agent, personality);

// NPC间通信
const commAPI = new NPCCommunicationAPI();
commAPI.sayToNearby('npc1', '大家好！');
commAPI.whisperTo('npc1', 'npc2', '悄悄话');
```

### 2. LangChainAgent.ts - AI智能决策引擎

**功能**：
- 完整的LangChain.js集成架构
- 记忆系统、人设系统、决策引擎
- 多轮对话处理
- 工具调用支持
- 降级机制（LLM不可用时的简单决策）

**核心类**：
- `LangChainNPCAgent` - 智能NPC Agent
- `ExtendedNPCPersonality` - 完整人设定义
- `LangChainConfig` - AI配置

**使用场景**：
```typescript
// 创建智能NPC
const agent = new LangChainNPCAgent(npc, personality, config);

// AI决策
await agent.makeDecision(context);

// 智能对话
const response = await agent.handleConversation(message, history);
```

### 3. MultiNPCExample.ts - 使用示例

**功能**：
- 展示如何创建具体的NPC角色（小美、老王）
- MainScene集成示例
- 快速启动模板
- 环境配置说明

## 🔄 从单NPC到多NPC的扩展流程

### 阶段1：单NPC完善（当前阶段）

```typescript
// 1. 先完善一个NPC的AI功能
const xiaomei = createCafeOwnerXiaoMei();

// 2. 测试LangChain集成
await xiaomei.agent.handleConversation("你好", []);

// 3. 优化提示词和决策逻辑
// 4. 控制LLM调用成本
```

### 阶段2：多NPC扩展

```typescript
// 1. 直接复用架构创建新NPC
const laowang = createStoreOwnerLaoWang();

// 2. 注册到管理器
manager.registerNPC(xiaomei.npc, xiaomei.agent, xiaomei.personality);
manager.registerNPC(laowang.npc, laowang.agent, laowang.personality);

// 3. 启用NPC间通信
commAPI.sayToNearby('xiaomei_001', '新咖啡豆到了！');
```

### 阶段3：复杂社交系统

```typescript
// 1. 利用共享知识库
commAPI.recordEvent('xiaomei_001', '重要事件', KnowledgeCategory.LOCATION_EVENT);

// 2. 查询社区动态
const news = commAPI.getCommunityNews();

// 3. 基于关系网的行为调整
// 4. 群体行为和集群智能
```

## 🛠️ 集成到MainScene的步骤

### 1. 安装依赖

```bash
# LangChain.js核心依赖
npm install @langchain/core @langchain/openai @langchain/community
npm install langchain

# 环境变量支持
npm install dotenv
```

### 2. 配置环境变量

```bash
# 创建.env文件
OPENAI_API_KEY=sk-your-openai-api-key-here
```

### 3. 修改MainScene.ts

```typescript
import { MultiNPCIntegrationExample } from '../agents/MultiNPCExample';

export class MainScene extends Phaser.Scene {
    private multiNPCSystem: MultiNPCIntegrationExample;

    create() {
        // ... 现有代码 ...
        
        // 初始化多NPC系统
        this.multiNPCSystem = new MultiNPCIntegrationExample();
        this.multiNPCSystem.initializeMultiNPCSystem(this);
    }

    update() {
        // ... 现有代码 ...
        
        // 更新多NPC系统
        this.multiNPCSystem.updateMultiNPCSystem();
    }
}
```

## 💡 设计亮点

### 1. **渐进式扩展**
- 单NPC时只使用基本功能
- 多NPC时自动启用高级功能
- 不需要重写现有代码

### 2. **成本控制**
- LLM调用频率限制（5秒间隔，最多2个并发）
- 降级机制（LLM不可用时使用简单决策）
- 不同NPC使用不同模型（GPT-4 vs GPT-3.5）

### 3. **架构解耦**
- NPC实体、AI逻辑、通信系统独立
- 支持不同的AI后端（OpenAI、本地LLM）
- 可插拔的工具系统

### 4. **现实主义**
- 基于距离的通信范围
- 性格驱动的行为差异
- 记忆和情感状态管理

## 🔧 开发建议

### 当前阶段（单NPC完善）

1. **专注一个NPC**：先让小美变得完美
2. **测试LangChain集成**：确保API调用正常
3. **优化提示词**：调试人设和对话质量
4. **控制成本**：设置合理的调用频率

### 未来扩展（多NPC阶段）

1. **复制成功模式**：基于小美的模式创建其他NPC
2. **测试通信系统**：验证NPC间信息传播
3. **平衡社交活跃度**：避免过度频繁的自动交流
4. **监控性能**：确保多NPC不影响游戏流畅度

## 📊 性能估算

### 单NPC阶段
- **LLM调用**：约 20-30次/小时（30秒间隔 + 对话触发）
- **API成本**：约 $0.05-0.10/小时（基于GPT-4定价）
- **性能影响**：几乎无影响

### 多NPC阶段（3-5个NPC）
- **LLM调用**：约 100-150次/小时（频率限制生效）
- **API成本**：约 $0.20-0.50/小时
- **性能影响**：轻微，主要是网络延迟

## 🚀 快速开始

1. 复制`MultiNPCExample.ts`中的示例代码
2. 根据需要修改NPC人设
3. 配置OpenAI API密钥
4. 在MainScene中集成多NPC系统
5. 开始测试和迭代

这个架构设计既考虑了当前的开发需求，也为未来的扩展做了充分准备。你可以专注于完善单个NPC的AI功能，而不用担心架构无法扩展到多NPC场景。

---

**下一步建议**：先安装LangChain.js依赖，然后基于`LangChainAgent.ts`实现小美的AI对话功能。