/**
 * NPC管理器 - 多NPC扩展的核心架构
 * 
 * 功能：
 * 1. 统一管理所有NPC实例
 * 2. 协调NPC间的通信
 * 3. 管理共享知识库
 * 4. 处理NPC间的碰撞避让
 * 5. 优化LLM API调用频率
 */

import { NPC, NPCState } from '../game/NPC';
import { AIAgent, NPCPersonality } from '../game/AIAgent';

// NPC间通信消息类型
export enum MessageType {
    GREETING = 'greeting',           // 问候
    INFORMATION = 'information',     // 信息分享
    REQUEST = 'request',             // 请求帮助
    GOSSIP = 'gossip',               // 八卦传播
    WORK_UPDATE = 'work_update',     // 工作状态更新
    MOOD_CHANGE = 'mood_change'      // 心情变化
}

// NPC间消息结构
export interface NPCMessage {
    id: string;                      // 消息ID
    fromNPC: string;                 // 发送者NPC ID
    toNPC: string;                   // 接收者NPC ID（'broadcast'表示广播）
    type: MessageType;               // 消息类型
    content: string;                 // 消息内容
    timestamp: number;               // 发送时间
    importance: number;              // 重要程度(0-1)
    location?: { x: number; y: number }; // 发生位置
}

// 共享知识条目
export interface SharedKnowledge {
    id: string;                      // 知识ID
    content: string;                 // 知识内容
    source: string;                  // 来源NPC
    timestamp: number;               // 创建时间
    category: KnowledgeCategory;     // 知识类别
    reliability: number;             // 可靠性(0-1)
    tags: string[];                  // 标签
}

export enum KnowledgeCategory {
    PLAYER_INFO = 'player_info',     // 玩家相关信息
    NPC_BEHAVIOR = 'npc_behavior',   // NPC行为模式
    LOCATION_EVENT = 'location_event', // 地点事件
    TIME_BASED = 'time_based',       // 时间相关
    WEATHER = 'weather',             // 天气信息
    GENERAL = 'general'              // 一般信息
}

// NPC配置信息
export interface NPCRegistration {
    npc: NPC;                        // NPC实例
    agent: AIAgent;                  // 对应的AI Agent
    personality: NPCPersonality;     // 人设配置
    communicationRange: number;      // 通信范围（像素）
    lastLLMCall: number;            // 上次LLM调用时间
    messageQueue: NPCMessage[];      // 消息队列
    isActive: boolean;               // 是否活跃
}

/**
 * NPC管理器 - 单例模式
 */
export class NPCManager {
    private static instance: NPCManager;
    private npcs: Map<string, NPCRegistration> = new Map();
    private sharedKnowledge: Map<string, SharedKnowledge> = new Map();
    private messageHistory: NPCMessage[] = [];
    
    // LLM调用优化配置
    private readonly LLM_CALL_INTERVAL = 5000; // 最小调用间隔(ms)
    private readonly MAX_CONCURRENT_LLM_CALLS = 2; // 最大并发LLM调用
    private activeLLMCalls = 0;

    private constructor() {}

    static getInstance(): NPCManager {
        if (!NPCManager.instance) {
            NPCManager.instance = new NPCManager();
        }
        return NPCManager.instance;
    }

    /**
     * 注册新NPC
     */
    registerNPC(npc: NPC, agent: AIAgent, personality: NPCPersonality): void {
        const registration: NPCRegistration = {
            npc,
            agent,
            personality,
            communicationRange: 100, // 默认通信范围100像素
            lastLLMCall: 0,
            messageQueue: [],
            isActive: true
        };

        this.npcs.set(npc.getId(), registration);
        console.log(`NPC Manager: 注册NPC ${npc.getName()} (${npc.getId()})`);
    }

    /**
     * 注销NPC
     */
    unregisterNPC(npcId: string): void {
        this.npcs.delete(npcId);
        console.log(`NPC Manager: 注销NPC ${npcId}`);
    }

    /**
     * 获取所有活跃NPC
     */
    getActiveNPCs(): NPCRegistration[] {
        return Array.from(this.npcs.values()).filter(reg => reg.isActive);
    }

    /**
     * 获取指定NPC
     */
    getNPC(npcId: string): NPCRegistration | undefined {
        return this.npcs.get(npcId);
    }

    /**
     * NPC间发送消息
     */
    sendMessage(message: NPCMessage): void {
        // 广播消息
        if (message.toNPC === 'broadcast') {
            this.broadcastMessage(message);
            return;
        }

        // 点对点消息
        const targetNPC = this.npcs.get(message.toNPC);
        if (targetNPC && this.isInRange(message.fromNPC, message.toNPC)) {
            targetNPC.messageQueue.push(message);
            this.messageHistory.push(message);
            console.log(`消息发送: ${message.fromNPC} -> ${message.toNPC}: ${message.content}`);
        }
    }

    /**
     * 广播消息（范围内所有NPC）
     */
    private broadcastMessage(message: NPCMessage): void {
        const senderNPC = this.npcs.get(message.fromNPC);
        if (!senderNPC) return;

        const senderPos = senderNPC.npc.getPosition();

        for (const [npcId, registration] of this.npcs) {
            if (npcId === message.fromNPC) continue; // 跳过发送者

            const receiverPos = registration.npc.getPosition();
            const distance = this.calculateDistance(senderPos, receiverPos);

            if (distance <= registration.communicationRange) {
                const targetMessage: NPCMessage = {
                    ...message,
                    toNPC: npcId
                };
                registration.messageQueue.push(targetMessage);
            }
        }

        this.messageHistory.push(message);
    }

    /**
     * 获取NPC的待处理消息
     */
    getMessages(npcId: string): NPCMessage[] {
        const registration = this.npcs.get(npcId);
        if (!registration) return [];

        const messages = registration.messageQueue.splice(0); // 取出并清空队列
        return messages;
    }

    /**
     * 添加共享知识
     */
    addSharedKnowledge(knowledge: SharedKnowledge): void {
        this.sharedKnowledge.set(knowledge.id, knowledge);
        console.log(`添加共享知识: ${knowledge.category} - ${knowledge.content}`);
    }

    /**
     * 查询共享知识
     */
    querySharedKnowledge(category?: KnowledgeCategory, tags?: string[]): SharedKnowledge[] {
        let results = Array.from(this.sharedKnowledge.values());

        if (category) {
            results = results.filter(k => k.category === category);
        }

        if (tags && tags.length > 0) {
            results = results.filter(k => 
                tags.some(tag => k.tags.includes(tag))
            );
        }

        // 按时间和可靠性排序
        return results.sort((a, b) => 
            (b.reliability * 100 + b.timestamp / 1000) - 
            (a.reliability * 100 + a.timestamp / 1000)
        );
    }

    /**
     * LLM调用频率控制
     */
    canCallLLM(npcId: string): boolean {
        const registration = this.npcs.get(npcId);
        if (!registration) return false;

        const now = Date.now();
        const timeSinceLastCall = now - registration.lastLLMCall;

        return timeSinceLastCall >= this.LLM_CALL_INTERVAL && 
               this.activeLLMCalls < this.MAX_CONCURRENT_LLM_CALLS;
    }

    /**
     * 标记LLM调用开始
     */
    markLLMCallStart(npcId: string): void {
        const registration = this.npcs.get(npcId);
        if (registration) {
            registration.lastLLMCall = Date.now();
            this.activeLLMCalls++;
        }
    }

    /**
     * 标记LLM调用结束
     */
    markLLMCallEnd(npcId: string): void {
        this.activeLLMCalls = Math.max(0, this.activeLLMCalls - 1);
    }

    /**
     * 获取NPC附近的其他NPC
     */
    getNearbyNPCs(npcId: string, range?: number): NPC[] {
        const targetNPC = this.npcs.get(npcId);
        if (!targetNPC) return [];

        const targetPos = targetNPC.npc.getPosition();
        const searchRange = range || targetNPC.communicationRange;

        return Array.from(this.npcs.values())
            .filter(reg => reg.npc.getId() !== npcId && reg.isActive)
            .filter(reg => {
                const pos = reg.npc.getPosition();
                return this.calculateDistance(targetPos, pos) <= searchRange;
            })
            .map(reg => reg.npc);
    }

    /**
     * 获取消息历史（用于AI Agent了解社区动态）
     */
    getRecentMessages(limit: number = 50): NPCMessage[] {
        return this.messageHistory
            .slice(-limit)
            .sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * 主更新循环 - 由游戏主循环调用
     */
    update(): void {
        // 1. 更新NPC状态
        this.updateNPCStates();
        
        // 2. 处理自动社交（NPC自发交流）
        this.handleAutoSocial();
        
        // 3. 清理过期数据
        this.cleanup();
    }

    // ========== 私有辅助方法 ==========

    private isInRange(fromNPCId: string, toNPCId: string): boolean {
        const fromNPC = this.npcs.get(fromNPCId);
        const toNPC = this.npcs.get(toNPCId);
        
        if (!fromNPC || !toNPC) return false;

        const fromPos = fromNPC.npc.getPosition();
        const toPos = toNPC.npc.getPosition();
        const distance = this.calculateDistance(fromPos, toPos);

        return distance <= fromNPC.communicationRange;
    }

    private calculateDistance(pos1: { x: number; y: number }, pos2: { x: number; y: number }): number {
        const dx = pos1.x - pos2.x;
        const dy = pos1.y - pos2.y;
        return Math.sqrt(dx * dx + dy * dy);
    }

    private updateNPCStates(): void {
        for (const registration of this.npcs.values()) {
            // 更新NPC活跃状态
            const state = registration.npc.getState();
            registration.isActive = state !== NPCState.TALKING; // 对话中不参与其他活动
        }
    }

    private handleAutoSocial(): void {
        // 检查相邻的NPC是否应该自发交流
        const activeNPCs = this.getActiveNPCs();
        
        for (let i = 0; i < activeNPCs.length; i++) {
            for (let j = i + 1; j < activeNPCs.length; j++) {
                const npc1 = activeNPCs[i];
                const npc2 = activeNPCs[j];
                
                if (this.shouldAutoInteract(npc1, npc2)) {
                    this.triggerAutoInteraction(npc1, npc2);
                }
            }
        }
    }

    private shouldAutoInteract(npc1: NPCRegistration, npc2: NPCRegistration): boolean {
        // 基于距离和性格判断是否应该自发交流
        const distance = this.calculateDistance(
            npc1.npc.getPosition(), 
            npc2.npc.getPosition()
        );
        
        const socialRange = Math.min(npc1.communicationRange, npc2.communicationRange);
        const sociabilityFactor = (npc1.personality.sociability + npc2.personality.sociability) / 2;
        
        return distance <= socialRange * 0.3 && // 较近距离
               Math.random() < sociabilityFactor * 0.01; // 基于社交性的随机触发
    }

    private triggerAutoInteraction(npc1: NPCRegistration, npc2: NPCRegistration): void {
        // 生成自动交流消息
        const greetingMessage: NPCMessage = {
            id: `auto_${Date.now()}_${Math.random()}`,
            fromNPC: npc1.npc.getId(),
            toNPC: npc2.npc.getId(),
            type: MessageType.GREETING,
            content: `${npc1.npc.getName()}主动向${npc2.npc.getName()}打招呼`,
            timestamp: Date.now(),
            importance: 0.3,
            location: npc1.npc.getPosition()
        };

        this.sendMessage(greetingMessage);
    }

    private cleanup(): void {
        // 清理过期的消息历史（保留最近1000条）
        if (this.messageHistory.length > 1000) {
            this.messageHistory = this.messageHistory.slice(-1000);
        }

        // 清理过期的共享知识（超过24小时的低重要性知识）
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        for (const [id, knowledge] of this.sharedKnowledge) {
            if (knowledge.timestamp < oneDayAgo && knowledge.importance < 0.5) {
                this.sharedKnowledge.delete(id);
            }
        }
    }
}

/**
 * 便利接口 - 为AI Agent提供简化的多NPC功能
 */
export class NPCCommunicationAPI {
    private manager = NPCManager.getInstance();

    /**
     * 发送消息给附近的NPC
     */
    sayToNearby(fromNPCId: string, content: string, type: MessageType = MessageType.INFORMATION): void {
        const message: NPCMessage = {
            id: `say_${Date.now()}_${Math.random()}`,
            fromNPC: fromNPCId,
            toNPC: 'broadcast',
            type,
            content,
            timestamp: Date.now(),
            importance: 0.5
        };
        
        this.manager.sendMessage(message);
    }

    /**
     * 向特定NPC发送私密消息
     */
    whisperTo(fromNPCId: string, toNPCId: string, content: string): void {
        const message: NPCMessage = {
            id: `whisper_${Date.now()}_${Math.random()}`,
            fromNPC: fromNPCId,
            toNPC: toNPCId,
            type: MessageType.INFORMATION,
            content,
            timestamp: Date.now(),
            importance: 0.8
        };
        
        this.manager.sendMessage(message);
    }

    /**
     * 记录重要事件到共享知识库
     */
    recordEvent(npcId: string, event: string, category: KnowledgeCategory, importance: number = 0.5): void {
        const knowledge: SharedKnowledge = {
            id: `event_${Date.now()}_${npcId}`,
            content: event,
            source: npcId,
            timestamp: Date.now(),
            category,
            reliability: importance,
            tags: ['event', npcId]
        };
        
        this.manager.addSharedKnowledge(knowledge);
    }

    /**
     * 查询他人告诉我的消息
     */
    getReceivedMessages(npcId: string): NPCMessage[] {
        return this.manager.getMessages(npcId);
    }

    /**
     * 查询社区动态
     */
    getCommunityNews(category?: KnowledgeCategory): SharedKnowledge[] {
        return this.manager.querySharedKnowledge(category);
    }

    /**
     * 获取附近的NPC列表
     */
    getNearbyNPCs(npcId: string): NPC[] {
        return this.manager.getNearbyNPCs(npcId);
    }

    /**
     * 检查是否可以调用LLM（避免频繁调用）
     */
    canUseLLM(npcId: string): boolean {
        return this.manager.canCallLLM(npcId);
    }

    /**
     * 标记LLM使用（用于频率控制）
     */
    markLLMUsage(npcId: string): void {
        this.manager.markLLMCallStart(npcId);
        // 5秒后自动释放
        setTimeout(() => this.manager.markLLMCallEnd(npcId), 5000);
    }
}