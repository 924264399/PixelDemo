/**
 * 多NPC扩展使用示例
 * 展示如何使用预留的架构创建和管理多个智能NPC
 */

import { NPC, NPCConfig } from '../game/NPC';
import { LangChainNPCAgent, ExtendedNPCPersonality, LangChainConfig } from './LangChainAgent';
import { NPCManager, NPCCommunicationAPI } from './NPCManager';

// ========== 示例：创建小美咖啡师 ==========

export function createCafeOwnerXiaoMei(): { npc: NPC, agent: LangChainNPCAgent } {
    // 1. 创建NPC实体
    const npcConfig: NPCConfig = {
        id: 'xiaomei_001',
        name: '小美',
        startX: 800,
        startY: 600,
        speed: 120,
        texture: 'npc1'
    };

    // 注意：这里需要Phaser Scene实例，实际使用时从MainScene传入
    // const npc = new NPC(scene, npcConfig);

    // 2. 定义人设
    const personality: ExtendedNPCPersonality = {
        // 基础属性
        curiosity: 0.7,
        sociability: 0.8,
        routine: 0.6,
        speed: 0.5,

        // 扩展属性
        name: '小美',
        role: '咖啡馆店员',
        age: 24,
        traits: ['温和', '勤奋', '略微内向', '对咖啡有热情'],
        interests: ['咖啡文化', '音乐', '读书', '烘焙'],
        workSchedule: {
            start: 8,
            end: 18,
            location: '咖啡馆',
            tasks: ['制作咖啡', '接待客人', '清洁店铺', '研究新配方']
        },
        relationships: new Map([
            ['player', 0.3],     // 对玩家有好感
            ['store_owner', 0.1] // 与便利店老板关系一般
        ]),
        speechStyle: {
            formality: 0.6,     // 较为正式
            verbosity: 0.4,     // 话不多
            humor: 0.3,         // 偶有幽默
            directness: 0.7     // 比较直接
        },
        preferences: {
            preferredTopics: ['咖啡', '音乐', '书籍', '工作'],
            avoidedTopics: ['隐私', '政治', '负面八卦'],
            socialDistance: 2.0  // 保持适当距离
        },
        currentMood: {
            happiness: 0.7,
            energy: 0.8,
            stress: 0.2,
            lastUpdated: Date.now()
        }
    };

    // 3. AI配置
    const aiConfig: LangChainConfig = {
        openai: {
            apiKey: process.env.OPENAI_API_KEY || '',
            model: 'gpt-4',
            temperature: 0.7,
            maxTokens: 500
        },
        memory: {
            maxTokens: 2000,
            summaryThreshold: 1500,
            k: 10
        },
        decision: {
            thinkingTime: 30,     // 30秒思考一次
            randomness: 0.3,      // 适度随机性
            contextWindow: 5      // 记住最近5次交互
        }
    };

    // 4. 创建智能Agent
    // 注意：实际使用时需要传入真实的NPC实例
    // const agent = new LangChainNPCAgent(npc, personality, aiConfig);

    return {
        npc: null as any, // 占位符
        agent: null as any // 占位符
    };
}

// ========== 示例：创建便利店老板 ==========

export function createStoreOwnerLaoWang(): { npc: NPC, agent: LangChainNPCAgent } {
    const personality: ExtendedNPCPersonality = {
        curiosity: 0.4,
        sociability: 0.9,    // 非常外向
        routine: 0.8,        // 严格按时间作息
        speed: 0.3,          // 动作较慢

        name: '老王',
        role: '便利店老板',
        age: 45,
        traits: ['热情', '健谈', '精明', '有商业头脑'],
        interests: ['生意经', '新闻', '社区八卦', '电视剧'],
        workSchedule: {
            start: 7,
            end: 22,
            location: '便利店',
            tasks: ['进货', '销售', '记账', '与顾客聊天']
        },
        relationships: new Map([
            ['player', 0.5],     // 喜欢玩家，潜在客户
            ['xiaomei_001', 0.1] // 与小美关系一般
        ]),
        speechStyle: {
            formality: 0.3,      // 不太正式
            verbosity: 0.8,      // 话很多
            humor: 0.6,          // 经常开玩笑
            directness: 0.9      // 非常直接
        },
        preferences: {
            preferredTopics: ['生意', '赚钱', '社区新闻', '家常'],
            avoidedTopics: ['个人隐私', '竞争对手'],
            socialDistance: 1.0   // 喜欢靠近聊天
        },
        currentMood: {
            happiness: 0.8,
            energy: 0.6,
            stress: 0.3,
            lastUpdated: Date.now()
        }
    };

    // 配置与小美略有不同
    const aiConfig: LangChainConfig = {
        openai: {
            apiKey: process.env.OPENAI_API_KEY || '',
            model: 'gpt-3.5-turbo', // 使用更便宜的模型
            temperature: 0.8,        // 更高的随机性，更健谈
            maxTokens: 300
        },
        memory: {
            maxTokens: 1500,
            summaryThreshold: 1200,
            k: 8
        },
        decision: {
            thinkingTime: 20,     // 更频繁的决策
            randomness: 0.4,      
            contextWindow: 3      
        }
    };

    return {
        npc: null as any,
        agent: null as any
    };
}

// ========== 示例：在MainScene中集成多NPC系统 ==========

export class MultiNPCIntegrationExample {
    private npcManager: NPCManager;
    private commAPI: NPCCommunicationAPI;
    
    constructor() {
        this.npcManager = NPCManager.getInstance();
        this.commAPI = new NPCCommunicationAPI();
    }

    /**
     * 在MainScene.create()中调用此方法初始化多NPC系统
     */
    initializeMultiNPCSystem(scene: Phaser.Scene): void {
        // 1. 创建小美
        const { npc: xiaoMeiNPC, agent: xiaoMeiAgent } = this.createXiaoMeiWithScene(scene);
        
        // 2. 创建老王
        const { npc: laoWangNPC, agent: laoWangAgent } = this.createLaoWangWithScene(scene);

        // 3. 注册到NPC管理器
        this.npcManager.registerNPC(xiaoMeiNPC, xiaoMeiAgent, xiaoMeiAgent['personality']);
        this.npcManager.registerNPC(laoWangNPC, laoWangAgent, laoWangAgent['personality']);

        console.log('多NPC系统初始化完成');
    }

    /**
     * 在MainScene.update()中调用此方法更新多NPC系统
     */
    updateMultiNPCSystem(): void {
        // 更新NPC管理器（处理消息传递、自动社交等）
        this.npcManager.update();
    }

    /**
     * 玩家与NPC对话的处理示例
     */
    async handlePlayerNPCConversation(
        npcId: string, 
        playerMessage: string,
        conversationHistory: Array<{sender: string, message: string}>
    ): Promise<string> {
        const npcRegistration = this.npcManager.getNPC(npcId);
        if (!npcRegistration) {
            return '找不到这个NPC';
        }

        // 调用LangChain Agent处理对话
        const agent = npcRegistration.agent as LangChainNPCAgent;
        const response = await agent.handleConversation(playerMessage, conversationHistory);

        return response.content;
    }

    /**
     * 演示NPC间通信
     */
    demonstrateNPCCommunication(): void {
        // 小美向附近广播
        this.commAPI.sayToNearby('xiaomei_001', '新的咖啡豆到了！欢迎大家来品尝！');

        // 老王回复（如果在范围内）
        setTimeout(() => {
            this.commAPI.whisperTo('laowang_002', 'xiaomei_001', '那太好了！我等会去买一杯！');
        }, 1000);

        // 记录社区事件
        this.commAPI.recordEvent(
            'xiaomei_001',
            '咖啡馆上新了特色咖啡豆',
            this.commAPI['manager']['sharedKnowledge'] ? 'LOCATION_EVENT' as any : 'general' as any
        );
    }

    // ========== 私有方法：创建具体NPC实例 ==========

    private createXiaoMeiWithScene(scene: Phaser.Scene): { npc: NPC, agent: LangChainNPCAgent } {
        const npcConfig: NPCConfig = {
            id: 'xiaomei_001',
            name: '小美',
            startX: 800,
            startY: 600,
            speed: 120,
            texture: 'npc1'
        };

        const npc = new NPC(scene, npcConfig);
        
        // 这里应该创建完整的personality和config，为简化示例省略
        const personality = {} as ExtendedNPCPersonality;
        const config = {} as LangChainConfig;
        
        const agent = new LangChainNPCAgent(npc, personality, config);

        return { npc, agent };
    }

    private createLaoWangWithScene(scene: Phaser.Scene): { npc: NPC, agent: LangChainNPCAgent } {
        const npcConfig: NPCConfig = {
            id: 'laowang_002',
            name: '老王',
            startX: 1200,
            startY: 800,
            speed: 100,
            texture: 'npc2' // 需要添加第二个NPC的贴图
        };

        const npc = new NPC(scene, npcConfig);
        const personality = {} as ExtendedNPCPersonality;
        const config = {} as LangChainConfig;
        const agent = new LangChainNPCAgent(npc, personality, config);

        return { npc, agent };
    }
}

// ========== 快速启动模板 ==========

/**
 * 在MainScene中快速集成的模板代码
 */
export const INTEGRATION_TEMPLATE = `
// 在MainScene类中添加：

import { MultiNPCIntegrationExample } from '../agents/MultiNPCExample';

export class MainScene extends Phaser.Scene {
    private multiNPCSystem: MultiNPCIntegrationExample;

    create() {
        // ... 现有创建逻辑 ...
        
        // 初始化多NPC系统
        this.multiNPCSystem = new MultiNPCIntegrationExample();
        this.multiNPCSystem.initializeMultiNPCSystem(this);
    }

    update() {
        // ... 现有更新逻辑 ...
        
        // 更新多NPC系统
        this.multiNPCSystem.updateMultiNPCSystem();
    }

    // 处理玩家与NPC对话
    async handleNPCDialog(npcId: string, playerMessage: string) {
        const response = await this.multiNPCSystem.handlePlayerNPCConversation(
            npcId, 
            playerMessage, 
            this.conversationHistory || []
        );
        
        // 显示NPC回复
        this.showDialog(response);
    }
}
`;

// ========== 环境变量配置示例 ==========

export const ENV_EXAMPLE = `
# 在项目根目录创建 .env 文件
# 添加OpenAI API密钥

OPENAI_API_KEY=sk-your-openai-api-key-here

# 可选：本地LLM配置
LOCAL_LLM_ENDPOINT=http://localhost:1234/v1
LOCAL_LLM_MODEL=llama-3.2-3b-instruct
`;

// ========== 安装依赖命令 ==========

export const INSTALL_COMMANDS = `
# 安装LangChain.js依赖
npm install @langchain/core @langchain/openai @langchain/community
npm install langchain

# 安装环境变量支持
npm install dotenv

# 可选：安装本地LLM支持
npm install @langchain/ollama
`;