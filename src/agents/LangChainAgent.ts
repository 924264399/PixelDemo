/**
 * LangChain.js 集成架构 - AI智能NPC的核心
 * 
 * 这个文件预留了LangChain集成的完整架构，包括：
 * 1. 记忆系统 (ConversationBufferMemory)
 * 2. 人设系统 (NPCPersonality + PromptTemplate)
 * 3. 决策引擎 (LLM + 结构化输出)
 * 4. 工具调用 (Tools for game actions)
 * 5. 多NPC通信支持
 */

import { NPC, NPCState, Vector2 } from '../game/NPC';
import { AIAgent, NPCPersonality, DecisionContext } from '../game/AIAgent';
import { NPCCommunicationAPI, MessageType, KnowledgeCategory } from './NPCManager';

// ========== LangChain.js 依赖接口（待安装） ==========

/**
 * 当前项目暂未安装LangChain.js依赖
 * 需要安装以下包：
 * 
 * npm install @langchain/core @langchain/openai @langchain/community
 * npm install langchain
 * 
 * 安装后取消下方注释：
 */

/*
import { ChatOpenAI } from '@langchain/openai';
import { ConversationBufferMemory } from 'langchain/memory';
import { PromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from 'langchain/output_parsers';
import { Tool } from '@langchain/core/tools';
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
*/

// ========== 临时类型定义（LangChain安装后删除） ==========

// 这些是临时的类型定义，安装LangChain后应该删除
interface MockChatOpenAI {
    invoke: (messages: any[]) => Promise<{ content: string }>;
}

interface MockConversationBufferMemory {
    saveContext: (inputs: Record<string, any>, outputs: Record<string, any>) => void;
    loadMemoryVariables: (inputs: Record<string, any>) => Promise<Record<string, any>>;
    clear: () => void;
}

interface MockPromptTemplate {
    format: (inputs: Record<string, any>) => Promise<string>;
}

interface MockTool {
    name: string;
    description: string;
    invoke: (input: string) => Promise<string>;
}

// ========== NPC决策输出结构 ==========

export interface NPCDecision {
    action: 'move' | 'stay' | 'talk' | 'work' | 'socialize';
    target?: { x: number; y: number } | string; // 坐标或地点名称
    message?: string;                           // 要说的话
    reasoning: string;                          // 决策理由
    confidence: number;                         // 信心度(0-1)
    duration?: number;                          // 持续时间(秒)
}

export interface NPCConversationResponse {
    content: string;                            // 回复内容
    emotion: 'happy' | 'sad' | 'angry' | 'neutral' | 'excited' | 'confused';
    followUpAction?: NPCDecision;               // 对话后的行为
}

// ========== AI Agent配置 ==========

export interface LangChainConfig {
    // OpenAI配置
    openai?: {
        apiKey: string;
        model: 'gpt-4' | 'gpt-3.5-turbo' | 'gpt-4-turbo';
        temperature: number;
        maxTokens?: number;
    };
    
    // 本地LLM配置（预留）
    localLLM?: {
        endpoint: string;
        model: string;
        temperature: number;
    };
    
    // 记忆配置
    memory: {
        maxTokens: number;              // 记忆最大token数
        summaryThreshold: number;       // 触发总结的阈值
        k: number;                      // 保持的对话轮数
    };
    
    // 决策配置
    decision: {
        thinkingTime: number;           // AI思考时间间隔(秒)
        randomness: number;             // 决策随机性(0-1)
        contextWindow: number;          // 上下文窗口大小
    };
}

// ========== 完整的NPCPersonality扩展 ==========

export interface ExtendedNPCPersonality extends NPCPersonality {
    // 基础属性（继承自原接口）
    curiosity: number;      
    sociability: number;    
    routine: number;        
    speed: number;          

    // 扩展属性
    name: string;                       // NPC姓名
    role: string;                       // 职业角色
    age: number;                        // 年龄
    traits: string[];                   // 性格特征
    interests: string[];                // 兴趣爱好
    workSchedule: {                     // 工作时间表
        start: number;                  // 开始时间(0-23)
        end: number;                    // 结束时间(0-23)
        location: string;               // 工作地点
        tasks: string[];                // 工作任务
    };
    relationships: Map<string, number>; // 与其他NPC的关系(-1到1)
    speechStyle: {                      // 说话风格
        formality: number;              // 正式程度(0-1)
        verbosity: number;              // 话多程度(0-1)
        humor: number;                  // 幽默感(0-1)
        directness: number;             // 直接程度(0-1)
    };
    preferences: {                      // 偏好设置
        preferredTopics: string[];      // 喜欢的话题
        avoidedTopics: string[];        // 避免的话题
        socialDistance: number;         // 社交距离偏好
    };
    currentMood: {                      // 当前心情
        happiness: number;              // 快乐度(0-1)
        energy: number;                 // 精力值(0-1)
        stress: number;                 // 压力值(0-1)
        lastUpdated: number;            // 上次更新时间
    };
}

// ========== LangChain智能NPC实现 ==========

export class LangChainNPCAgent extends AIAgent {
    // LangChain组件（安装后启用）
    private llm: MockChatOpenAI | null = null;
    private memory: MockConversationBufferMemory | null = null;
    private tools: MockTool[] = [];
    
    // 提示词模板
    private personalityPrompt: MockPromptTemplate | null = null;
    private decisionPrompt: MockPromptTemplate | null = null;
    private conversationPrompt: MockPromptTemplate | null = null;
    
    // 配置和状态
    private config: LangChainConfig;
    private personality: ExtendedNPCPersonality;
    private commAPI: NPCCommunicationAPI;
    private lastDecisionTime = 0;
    private currentGoal: string | null = null;
    
    constructor(
        npc: NPC, 
        personality: ExtendedNPCPersonality, 
        config: LangChainConfig
    ) {
        super(npc, personality);
        this.personality = personality;
        this.config = config;
        this.commAPI = new NPCCommunicationAPI();
        
        this.initializeLangChain();
        this.initializeTools();
    }

    // ========== 主要AI决策入口 ==========

    async makeDecision(context: DecisionContext): Promise<boolean> {
        // 1. 检查是否应该进行决策
        if (!this.shouldMakeDecision(context)) {
            return false;
        }

        // 2. 检查LLM调用频率限制
        if (!this.commAPI.canUseLLM(this.npc.getId())) {
            console.log(`${this.personality.name}: LLM调用频率限制，使用简单决策`);
            return this.makeSimpleDecision(context);
        }

        try {
            // 3. 标记LLM使用
            this.commAPI.markLLMUsage(this.npc.getId());

            // 4. 收集决策上下文
            const enhancedContext = await this.buildDecisionContext(context);

            // 5. 调用LLM进行决策
            const decision = await this.callLLMForDecision(enhancedContext);

            // 6. 执行决策
            await this.executeDecision(decision);

            // 7. 更新记忆和状态
            await this.updateMemoryAndState(decision, enhancedContext);

            this.lastDecisionTime = Date.now();
            return true;

        } catch (error) {
            console.error(`${this.personality.name} LLM决策失败:`, error);
            // 降级到简单决策
            return this.makeSimpleDecision(context);
        }
    }

    // ========== 对话处理 ==========

    async handleConversation(
        playerMessage: string, 
        conversationHistory: Array<{sender: string, message: string}>
    ): Promise<NPCConversationResponse> {
        try {
            // 1. 检查LLM调用限制
            if (!this.commAPI.canUseLLM(this.npc.getId())) {
                return this.getSimpleResponse(playerMessage);
            }

            // 2. 标记LLM使用
            this.commAPI.markLLMUsage(this.npc.getId());

            // 3. 构建对话上下文
            const conversationContext = await this.buildConversationContext(
                playerMessage, 
                conversationHistory
            );

            // 4. 调用LLM生成回复
            const response = await this.callLLMForConversation(conversationContext);

            // 5. 保存对话到记忆
            await this.saveConversationMemory(playerMessage, response.content);

            // 6. 更新NPC心情和关系
            this.updateMoodAndRelationships(playerMessage, response);

            // 7. 广播重要信息给其他NPC
            if (this.isImportantInformation(playerMessage)) {
                this.commAPI.sayToNearby(
                    this.npc.getId(),
                    `玩家告诉我: ${playerMessage}`,
                    MessageType.INFORMATION
                );
            }

            return response;

        } catch (error) {
            console.error(`${this.personality.name} 对话生成失败:`, error);
            return this.getSimpleResponse(playerMessage);
        }
    }

    // ========== LangChain初始化 ==========

    private initializeLangChain(): void {
        try {
            // TODO: 安装LangChain后启用以下代码
            /*
            // 初始化LLM
            if (this.config.openai) {
                this.llm = new ChatOpenAI({
                    openAIApiKey: this.config.openai.apiKey,
                    modelName: this.config.openai.model,
                    temperature: this.config.openai.temperature,
                    maxTokens: this.config.openai.maxTokens
                });
            }

            // 初始化记忆系统
            this.memory = new ConversationBufferMemory({
                memoryKey: "chat_history",
                returnMessages: true,
                k: this.config.memory.k
            });

            // 初始化提示词模板
            this.personalityPrompt = PromptTemplate.fromTemplate(this.getPersonalityPromptTemplate());
            this.decisionPrompt = PromptTemplate.fromTemplate(this.getDecisionPromptTemplate());
            this.conversationPrompt = PromptTemplate.fromTemplate(this.getConversationPromptTemplate());
            */

            console.log(`${this.personality.name}: LangChain初始化完成`);
        } catch (error) {
            console.error(`${this.personality.name}: LangChain初始化失败`, error);
        }
    }

    private initializeTools(): void {
        // 游戏行为工具集
        this.tools = [
            {
                name: 'move_to_location',
                description: '移动到指定地点',
                invoke: async (location: string) => {
                    await this.goToLocation(location);
                    return `已移动到${location}`;
                }
            },
            {
                name: 'say_to_nearby',
                description: '向附近的NPC说话',
                invoke: async (message: string) => {
                    this.commAPI.sayToNearby(this.npc.getId(), message);
                    return `已向附近NPC说: ${message}`;
                }
            },
            {
                name: 'record_event',
                description: '记录重要事件',
                invoke: async (event: string) => {
                    this.commAPI.recordEvent(
                        this.npc.getId(), 
                        event, 
                        KnowledgeCategory.GENERAL
                    );
                    return `已记录事件: ${event}`;
                }
            },
            {
                name: 'check_nearby_npcs',
                description: '查看附近的其他NPC',
                invoke: async () => {
                    const nearbyNPCs = this.commAPI.getNearbyNPCs(this.npc.getId());
                    return `附近的NPC: ${nearbyNPCs.map(n => n.getName()).join(', ')}`;
                }
            }
        ];
    }

    // ========== 决策相关方法 ==========

    private async buildDecisionContext(baseContext: DecisionContext): Promise<any> {
        // 收集完整的决策上下文
        const nearbyNPCs = this.commAPI.getNearbyNPCs(this.npc.getId());
        const recentMessages = this.commAPI.getReceivedMessages(this.npc.getId());
        const communityNews = this.commAPI.getCommunityNews();

        return {
            ...baseContext,
            personality: this.personality,
            currentMood: this.personality.currentMood,
            currentGoal: this.currentGoal,
            nearbyNPCs: nearbyNPCs.map(npc => ({ 
                name: npc.getName(), 
                position: npc.getPosition() 
            })),
            recentMessages: recentMessages.slice(-5), // 最近5条消息
            communityNews: communityNews.slice(-3),   // 最近3条社区动态
            workSchedule: this.personality.workSchedule
        };
    }

    private async callLLMForDecision(context: any): Promise<NPCDecision> {
        if (!this.llm || !this.decisionPrompt) {
            throw new Error('LangChain未正确初始化');
        }

        // TODO: 实际LLM调用逻辑
        // const prompt = await this.decisionPrompt.format(context);
        // const response = await this.llm.invoke([{ content: prompt }]);
        // return this.parseDecisionResponse(response.content);

        // 临时模拟决策
        return this.getMockDecision(context);
    }

    private async executeDecision(decision: NPCDecision): Promise<void> {
        switch (decision.action) {
            case 'move':
                if (typeof decision.target === 'string') {
                    await this.goToLocation(decision.target);
                } else if (decision.target) {
                    this.npc.setTarget(decision.target.x, decision.target.y);
                }
                break;
            
            case 'talk':
                if (decision.message) {
                    this.commAPI.sayToNearby(
                        this.npc.getId(), 
                        decision.message,
                        MessageType.INFORMATION
                    );
                }
                break;
            
            case 'work':
                await this.goToLocation(this.personality.workSchedule.location);
                this.currentGoal = '工作中';
                break;
            
            case 'socialize':
                const nearbyNPCs = this.commAPI.getNearbyNPCs(this.npc.getId());
                if (nearbyNPCs.length > 0 && decision.message) {
                    this.commAPI.sayToNearby(
                        this.npc.getId(),
                        decision.message,
                        MessageType.GREETING
                    );
                }
                break;
            
            case 'stay':
                // 保持当前状态
                break;
        }

        console.log(`${this.personality.name} 执行决策: ${decision.action} - ${decision.reasoning}`);
    }

    // ========== 对话相关方法 ==========

    private async buildConversationContext(
        playerMessage: string, 
        history: Array<{sender: string, message: string}>
    ): Promise<any> {
        return {
            playerMessage,
            conversationHistory: history,
            personality: this.personality,
            currentMood: this.personality.currentMood,
            currentLocation: this.npc.getPosition(),
            currentTime: new Date().getHours(),
            memoryContext: this.memory ? await this.memory.loadMemoryVariables({}) : {}
        };
    }

    private async callLLMForConversation(context: any): Promise<NPCConversationResponse> {
        if (!this.llm || !this.conversationPrompt) {
            throw new Error('LangChain未正确初始化');
        }

        // TODO: 实际LLM调用逻辑
        // const prompt = await this.conversationPrompt.format(context);
        // const response = await this.llm.invoke([{ content: prompt }]);
        // return this.parseConversationResponse(response.content);

        // 临时模拟回复
        return this.getMockConversationResponse(context.playerMessage);
    }

    private async saveConversationMemory(playerMessage: string, npcResponse: string): Promise<void> {
        if (this.memory) {
            await this.memory.saveContext(
                { player: playerMessage },
                { npc: npcResponse }
            );
        }
    }

    // ========== 提示词模板 ==========

    private getPersonalityPromptTemplate(): string {
        return `
你是{name}，一个{age}岁的{role}。

性格特点：{traits}
兴趣爱好：{interests}
工作时间：{workHours}
说话风格：正式程度{formality}，话多程度{verbosity}，幽默感{humor}

请始终保持这个人设，用这个角色的口吻和性格来回应所有对话和决策。
        `.trim();
    }

    private getDecisionPromptTemplate(): string {
        return `
你是{name}，现在需要决定下一步行为。

当前状态：
- 时间：{currentTime}:00
- 位置：{currentLocation}
- 心情：开心{happiness} 精力{energy} 压力{stress}
- 当前目标：{currentGoal}

环境信息：
- 附近NPC：{nearbyNPCs}
- 最近消息：{recentMessages}
- 社区动态：{communityNews}

工作安排：{workSchedule}

请根据你的性格和当前状况，选择一个行为并说明原因。
回复JSON格式：{
  "action": "move|stay|talk|work|socialize",
  "target": "地点名称或坐标",
  "message": "要说的话（如果有）",
  "reasoning": "决策理由",
  "confidence": 0.8
}
        `.trim();
    }

    private getConversationPromptTemplate(): string {
        return `
你是{name}，一个{role}。玩家刚刚对你说："{playerMessage}"

对话历史：{conversationHistory}
你的当前心情：{currentMood}
记忆上下文：{memoryContext}

请根据你的性格特点回复玩家，并表达相应的情感。
回复JSON格式：{
  "content": "回复内容",
  "emotion": "happy|sad|angry|neutral|excited|confused",
  "followUpAction": {"action": "...", "reasoning": "..."}
}
        `.trim();
    }

    // ========== 降级和模拟方法 ==========

    private shouldMakeDecision(context: DecisionContext): boolean {
        const now = Date.now();
        const timeSinceLastDecision = now - this.lastDecisionTime;
        const decisionInterval = this.config.decision.thinkingTime * 1000;

        return timeSinceLastDecision > decisionInterval && 
               this.npc.getState() === NPCState.IDLE;
    }

    private makeSimpleDecision(context: DecisionContext): boolean {
        // 简单决策逻辑（不调用LLM）
        const currentTime = context.timeOfDay;
        const schedule = this.personality.workSchedule;

        if (currentTime >= schedule.start && currentTime <= schedule.end) {
            // 工作时间
            this.goToLocation(schedule.location);
            this.currentGoal = '工作中';
        } else {
            // 休息时间，随机选择活动
            const activities = ['公园', '咖啡馆', '便利店'];
            const randomActivity = activities[Math.floor(Math.random() * activities.length)];
            this.goToLocation(randomActivity);
            this.currentGoal = `在${randomActivity}休息`;
        }

        this.lastDecisionTime = Date.now();
        return true;
    }

    private getMockDecision(context: any): NPCDecision {
        // 模拟LLM决策输出
        const actions: Array<NPCDecision['action']> = ['move', 'stay', 'work', 'socialize'];
        const randomAction = actions[Math.floor(Math.random() * actions.length)];

        return {
            action: randomAction,
            target: randomAction === 'move' ? '咖啡馆' : undefined,
            message: randomAction === 'socialize' ? '大家好！天气不错呢！' : undefined,
            reasoning: `基于当前时间${context.timeOfDay}和心情状态的随机决策`,
            confidence: 0.6
        };
    }

    private getSimpleResponse(playerMessage: string): NPCConversationResponse {
        // 简单回复（不调用LLM）
        const simpleResponses = [
            `你好！你说的关于"${playerMessage}"很有趣呢。`,
            `嗯，我明白你的意思。关于"${playerMessage}"，我也有类似的想法。`,
            `谢谢你告诉我这个。"${playerMessage}"确实值得思考。`,
            `哈哈，你说得对！"${playerMessage}"让我想到了很多事情。`
        ];

        const randomResponse = simpleResponses[Math.floor(Math.random() * simpleResponses.length)];

        return {
            content: randomResponse,
            emotion: 'happy',
            followUpAction: undefined
        };
    }

    private getMockConversationResponse(playerMessage: string): NPCConversationResponse {
        return {
            content: `作为${this.personality.role}，我觉得你说的"${playerMessage}"很有道理呢！`,
            emotion: 'happy',
            followUpAction: {
                action: 'stay',
                reasoning: '继续与玩家交谈',
                confidence: 0.8
            }
        };
    }

    private async updateMemoryAndState(decision: NPCDecision, context: any): Promise<void> {
        // 更新目标状态
        this.currentGoal = decision.reasoning;

        // 更新心情（基于决策结果）
        if (decision.confidence > 0.7) {
            this.personality.currentMood.happiness = Math.min(1, this.personality.currentMood.happiness + 0.1);
        }

        // 记录重要决策到共享知识库
        if (decision.confidence > 0.8) {
            this.commAPI.recordEvent(
                this.npc.getId(),
                `${this.personality.name}决定${decision.action}: ${decision.reasoning}`,
                KnowledgeCategory.NPC_BEHAVIOR
            );
        }
    }

    private updateMoodAndRelationships(playerMessage: string, response: NPCConversationResponse): void {
        // 基于对话更新心情
        switch (response.emotion) {
            case 'happy':
                this.personality.currentMood.happiness = Math.min(1, this.personality.currentMood.happiness + 0.1);
                break;
            case 'angry':
                this.personality.currentMood.stress = Math.min(1, this.personality.currentMood.stress + 0.1);
                break;
        }

        this.personality.currentMood.lastUpdated = Date.now();
    }

    private isImportantInformation(message: string): boolean {
        // 判断信息是否重要，需要传播给其他NPC
        const keywords = ['重要', '紧急', '新闻', '发生了', '听说'];
        return keywords.some(keyword => message.includes(keyword));
    }
}