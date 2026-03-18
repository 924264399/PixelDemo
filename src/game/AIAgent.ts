/**
 * AI Agent接口
 * 为大模型提供NPC控制能力，实现智能决策
 */

import { PathPlanner, Waypoint, PathRequest } from './PathPlanner';
import { NPC, NPCState } from './NPC';

export interface NPCMemory {
    recentVisits: { location: string; timestamp: number }[];
    currentGoal?: string;
    lastDecisionTime: number;
    personality: NPCPersonality;
}

export interface NPCPersonality {
    curiosity: number;      // 0-1, 探索新地方的倾向
    sociability: number;    // 0-1, 社交倾向
    routine: number;        // 0-1, 遵循固定路线的倾向
    speed: number;          // 0-1, 移动速度偏好
}

export interface DecisionContext {
    currentLocation: Waypoint;
    nearbyNPCs: NPC[];
    timeOfDay: number; // 0-24
    weatherCondition?: string;
    playerLocation?: Waypoint;
}

/**
 * AI Agent基类 - 大模型可以继承或实现此接口
 */
export abstract class AIAgent {
    protected npc: NPC;
    protected memory: NPCMemory;
    
    constructor(npc: NPC, personality: NPCPersonality) {
        this.npc = npc;
        this.memory = {
            recentVisits: [],
            lastDecisionTime: 0,
            personality
        };
    }

    /**
     * 主决策循环 - 大模型在这里实现智能决策
     * @param context 当前环境上下文
     * @returns 是否做出了新决策
     */
    abstract makeDecision(context: DecisionContext): Promise<boolean>;

    /**
     * AI Agent调用接口：让NPC前往指定地点
     */
    protected async goToLocation(locationName: string, randomization: number = 0.3): Promise<void> {
        const currentPos = this.npc.getPosition();
        const destination = this.findLocationByName(locationName);
        
        if (!destination) {
            console.warn(`AI Agent: 未找到位置 "${locationName}"`);
            return;
        }

        const pathRequest: PathRequest = {
            from: currentPos,
            to: destination,
            npcId: this.npc.getId(),
            randomization: randomization
        };

        const path = PathPlanner.planPath(pathRequest);
        await this.followPath(path);
    }

    /**
     * AI Agent调用接口：获取可访问的兴趣点
     */
    protected getAvailableDestinations(type?: string): Waypoint[] {
        return PathPlanner.getPointOfInterest(type);
    }

    /**
     * AI Agent调用接口：更新记忆
     */
    protected updateMemory(location: string): void {
        this.memory.recentVisits.push({
            location,
            timestamp: Date.now()
        });

        // 保持最近10次访问记录
        if (this.memory.recentVisits.length > 10) {
            this.memory.recentVisits.shift();
        }
    }

    /**
     * AI Agent调用接口：检查是否应该做决策
     */
    protected shouldMakeDecision(): boolean {
        const now = Date.now();
        const timeSinceLastDecision = now - this.memory.lastDecisionTime;
        const personality = this.memory.personality;
        
        // 基于性格决定决策频率
        const decisionInterval = 5000 + (personality.routine * 10000); // 5-15秒
        
        return timeSinceLastDecision > decisionInterval && this.npc.getState() === NPCState.IDLE;
    }

    // ========== 内部辅助方法 ==========

    private async followPath(path: Waypoint[]): Promise<void> {
        for (const waypoint of path) {
            this.npc.setTarget(waypoint.x, waypoint.y);
            
            // 等待到达当前路点
            await this.waitForArrival();
        }
    }

    private waitForArrival(): Promise<void> {
        return new Promise((resolve) => {
            const checkArrival = () => {
                if (this.npc.getState() === NPCState.IDLE) {
                    resolve();
                } else {
                    setTimeout(checkArrival, 100);
                }
            };
            checkArrival();
        });
    }

    private findLocationByName(name: string): Waypoint | null {
        const locations = PathPlanner.getPointOfInterest();
        return locations.find(loc => loc.name?.includes(name)) || null;
    }
}

/**
 * 预设AI Agent - 演示如何实现智能决策
 */
export class CafeWorkerAgent extends AIAgent {
    async makeDecision(context: DecisionContext): Promise<boolean> {
        if (!this.shouldMakeDecision()) return false;

        const personality = this.memory.personality;
        const currentTime = context.timeOfDay;

        // 简单的决策树（未来可以接入大模型）
        if (currentTime >= 8 && currentTime <= 18) {
            // 工作时间：在咖啡馆和便利店之间
            if (Math.random() < personality.curiosity) {
                await this.goToLocation('便利店', 0.4);
                this.memory.currentGoal = '去便利店查看';
            } else {
                await this.goToLocation('咖啡馆', 0.2);
                this.memory.currentGoal = '回到工作岗位';
            }
        } else {
            // 休息时间：去公园或其他地方
            if (Math.random() < personality.sociability) {
                await this.goToLocation('公园', 0.5);
                this.memory.currentGoal = '去公园放松';
            }
        }

        this.memory.lastDecisionTime = Date.now();
        return true;
    }
}

/**
 * 大模型AI Agent接口 - 预留给LangChain.js集成
 */
export interface LLMAgentConfig {
    modelName: string;
    apiKey?: string;
    prompt: string;
    temperature: number;
}

export class LLMAgent extends AIAgent {
    private config: LLMAgentConfig;
    
    constructor(npc: NPC, personality: NPCPersonality, config: LLMAgentConfig) {
        super(npc, personality);
        this.config = config;
    }

    async makeDecision(context: DecisionContext): Promise<boolean> {
        if (!this.shouldMakeDecision()) return false;

        try {
            // 构建决策上下文
            const decisionPrompt = this.buildDecisionPrompt(context);
            
            // TODO: 集成LangChain.js调用大模型
            // const decision = await this.callLLM(decisionPrompt);
            // const action = this.parseDecision(decision);
            // await this.executeAction(action);

            console.log('LLM Agent决策:', decisionPrompt);
            
            // 临时：使用预设决策
            return await this.fallbackDecision(context);
        } catch (error) {
            console.error('LLM Agent决策失败:', error);
            return await this.fallbackDecision(context);
        }
    }

    private buildDecisionPrompt(context: DecisionContext): string {
        const availableLocations = this.getAvailableDestinations().map(loc => loc.name).join(', ');
        
        return `
你是一个AI小镇的NPC，名叫${this.npc.getName()}。
当前位置: ${context.currentLocation.name}
可访问位置: ${availableLocations}
时间: ${context.timeOfDay}:00
性格特征: 好奇心${this.memory.personality.curiosity}, 社交性${this.memory.personality.sociability}
最近访问: ${this.memory.recentVisits.map(v => v.location).join(', ')}

请决定下一步行动，只能选择一个可访问的位置，或者选择"stay"留在原地。
回复格式: {"action": "go", "location": "位置名称"} 或 {"action": "stay"}
        `.trim();
    }

    private async fallbackDecision(context: DecisionContext): Promise<boolean> {
        // 降级到简单决策逻辑
        const locations = this.getAvailableDestinations();
        if (locations.length > 0) {
            const randomLocation = locations[Math.floor(Math.random() * locations.length)];
            await this.goToLocation(randomLocation.name || '', 0.4);
            return true;
        }
        return false;
    }
}