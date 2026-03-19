/**
 * 警察NPC - "老刘"的完整角色定义
 * 
 * 背景故事：
 * 老刘，48岁，从警23年的社区民警，负责这个小镇的治安工作。
 * 年轻时梦想成为刑警破大案，但最终发现保护社区居民的日常安全
 * 同样有意义。经历过几次重大案件后，练就了敏锐的观察力。
 * 虽然表面严肃，但内心温暖，把每个居民都当作自己要保护的人。
 */

import { NPC, NPCConfig } from '../game/NPC';
import { NPCAIAssistant, AIServiceManager } from '../utils/AIService';

// 警察NPC的完整人设定义
export interface PoliceOfficerPersonality {
    // 基础信息
    name: string;
    role: string;
    age: number;
    experience: number; // 从警年数
    
    // 性格特征
    traits: {
        vigilance: number;      // 警觉性 (0-1)
        compassion: number;     // 同情心 (0-1)
        authority: number;      // 威严感 (0-1)
        humor: number;          // 幽默感 (0-1)
        patience: number;       // 耐心 (0-1)
        curiosity: number;      // 好奇心 (0-1)
    };
    
    // 工作相关
    workSchedule: {
        patrolStart: number;    // 巡逻开始时间
        patrolEnd: number;      // 巡逻结束时间
        breakTime: number;      // 休息时间
        paperworkTime: number;  // 文书工作时间
    };
    
    // 背景故事
    background: {
        joinReason: string;     // 当警察的原因
        careerHighlight: string; // 职业生涯亮点
        personalChallenge: string; // 个人挑战
        philosophy: string;      // 工作哲学
    };
    
    // 兴趣爱好
    interests: string[];
    
    // 说话风格
    speechPatterns: {
        formalness: number;     // 正式程度
        directness: number;     // 直接程度
        warmth: number;         // 温暖程度
        professionalJargon: boolean; // 是否使用警察术语
    };
    
    // 对不同话题的反应
    topicReactions: {
        crime: 'serious' | 'engaged' | 'professional';
        community: 'caring' | 'protective' | 'proud';
        personal: 'reserved' | 'open' | 'deflective';
        work: 'passionate' | 'dutiful' | 'tired';
        humor: 'dry' | 'warm' | 'reluctant';
    };
    
    // 当前状态
    currentState: {
        mood: number;           // 当前心情 (-1到1)
        energy: number;         // 精力值 (0-1)
        suspicion: number;      // 警觉程度 (0-1)
        workload: number;       // 工作负担 (0-1)
    };
}

/**
 * 创建警察NPC "老刘"
 */
export function createPoliceOfficerLiuPersonality(): PoliceOfficerPersonality {
    return {
        // 基础信息
        name: '老刘',
        role: '社区民警',
        age: 48,
        experience: 23,
        
        // 性格特征
        traits: {
            vigilance: 0.8,     // 非常警觉
            compassion: 0.7,    // 富有同情心
            authority: 0.6,     // 适中的威严
            humor: 0.4,         // 偶尔幽默
            patience: 0.8,      // 很有耐心
            curiosity: 0.6      // 职业好奇心
        },
        
        // 工作时间表
        workSchedule: {
            patrolStart: 8,     // 8点开始巡逻
            patrolEnd: 18,      // 18点结束
            breakTime: 12,      // 12点休息
            paperworkTime: 19   // 19点处理文书
        },
        
        // 背景故事
        background: {
            joinReason: "年轻时看到邻居家被盗，发誓要保护无辜的人",
            careerHighlight: "三年前破获了镇上最大的电信诈骗案，挽回损失50万元",
            personalChallenge: "平衡工作与家庭，错过了女儿很多重要时刻",
            philosophy: "真正的警察不是抓多少坏人，而是让多少好人安心生活"
        },
        
        // 兴趣爱好
        interests: [
            '象棋', '新闻', '推理小说', '社区建设', 
            '交通安全', '青少年教育', '老年人防骗'
        ],
        
        // 说话风格
        speechPatterns: {
            formalness: 0.6,    // 较为正式但不死板
            directness: 0.7,    // 比较直接
            warmth: 0.6,        // 有温度但克制
            professionalJargon: true // 偶尔使用警察术语
        },
        
        // 话题反应
        topicReactions: {
            crime: 'professional',  // 对犯罪话题专业
            community: 'caring',    // 对社区关爱
            personal: 'reserved',   // 个人话题保守
            work: 'passionate',     // 对工作有激情
            humor: 'dry'            // 干式幽默
        },
        
        // 当前状态
        currentState: {
            mood: 0.2,          // 略微积极
            energy: 0.7,        // 精力充沛
            suspicion: 0.3,     // 日常警觉
            workload: 0.5       // 正常工作量
        }
    };
}

/**
 * 智能警察NPC - 集成AI功能
 */
export class PoliceOfficerNPC {
    private npc: NPC;
    private personality: PoliceOfficerPersonality;
    private aiAssistant: NPCAIAssistant;
    private lastPatrolTime = 0;
    private lastDecisionTime = 0;
    private currentGoal: string = '巡逻';
    private observationNotes: string[] = []; // 观察笔记

    constructor(scene: Phaser.Scene) {
        try {
            // 1. 创建NPC实体
            const npcConfig: NPCConfig = {
                id: 'officer_liu',
                name: '老刘',
                startX: 900,  // 在警局附近
                startY: 1400,
                speed: 100,   // 稳重的移动速度
                texture: 'npc1' // 使用现有的npc1贴图
            };

            this.npc = new NPC(scene, npcConfig);
            this.personality = createPoliceOfficerLiuPersonality();
            
            // 2. 创建AI助手
            const aiManager = AIServiceManager.getInstance();
            this.aiAssistant = aiManager.createAssistant('officer_liu');

            console.log(`👮‍♂️ 警官${this.personality.name}已就职，开始维护社区安全`);
        } catch (error) {
            console.error('警察NPC创建失败:', error);
            throw error;
        }
    }

    /**
     * 获取NPC实例（供外部使用）
     */
    getNPC(): NPC {
        return this.npc;
    }

    /**
     * 主要更新循环
     */
    async update(): Promise<void> {
        const now = Date.now();
        
        // 1. 每30秒进行一次AI决策
        if (now - this.lastDecisionTime > 30000) {
            await this.makeAIDecision();
            this.lastDecisionTime = now;
        }

        // 2. 巡逻逻辑
        this.updatePatrolBehavior();

        // 3. 更新状态
        this.updateEmotionalState();
    }

    /**
     * 处理与玩家对话
     */
    async handlePlayerConversation(playerMessage: string): Promise<string> {
        // 1. 生成系统提示词
        const systemPrompt = this.generateConversationPrompt();
        
        // 2. 调用AI处理对话
        const aiResponse = await this.aiAssistant.handleConversation(
            systemPrompt,
            playerMessage
        );

        // 3. 如果AI失败，使用降级回复
        if (!aiResponse) {
            return this.getFallbackResponse(playerMessage);
        }

        // 4. 记录重要信息
        this.recordObservation(`玩家说: "${playerMessage}"`);

        return aiResponse;
    }

    /**
     * AI决策制定
     */
    private async makeAIDecision(): Promise<void> {
        const currentTime = new Date().getHours();
        const context = this.buildDecisionContext(currentTime);
        const systemPrompt = this.generateDecisionPrompt();

        const decision = await this.aiAssistant.makeDecision(systemPrompt, context);
        
        if (decision) {
            await this.executeAIDecision(decision);
        } else {
            // 降级决策
            this.makeFallbackDecision(currentTime);
        }
    }

    /**
     * 生成对话系统提示词
     */
    private generateConversationPrompt(): string {
        const p = this.personality;
        const currentTime = new Date().getHours();
        const timeContext = this.getTimeContext(currentTime);

        return `你是${p.name}，一位${p.age}岁的${p.role}，从警${p.experience}年。

【人物背景】
- 当警察的原因：${p.background.joinReason}
- 职业亮点：${p.background.careerHighlight}
- 工作哲学：${p.background.philosophy}

【性格特征】
- 警觉性：${(p.traits.vigilance * 100).toFixed(0)}% | 同情心：${(p.traits.compassion * 100).toFixed(0)}%
- 威严感：${(p.traits.authority * 100).toFixed(0)}% | 幽默感：${(p.traits.humor * 100).toFixed(0)}%
- 耐心：${(p.traits.patience * 100).toFixed(0)}% | 好奇心：${(p.traits.curiosity * 100).toFixed(0)}%

【当前状态】
- 时间：${currentTime}:00 (${timeContext})
- 心情：${p.currentState.mood > 0 ? '较好' : p.currentState.mood < 0 ? '较差' : '一般'}
- 精力：${(p.currentState.energy * 100).toFixed(0)}%
- 警觉程度：${(p.currentState.suspicion * 100).toFixed(0)}%

【说话风格】
- ${p.speechPatterns.formalness > 0.5 ? '相对正式' : '比较随和'}，${p.speechPatterns.directness > 0.5 ? '说话直接' : '委婉表达'}
- ${p.speechPatterns.warmth > 0.5 ? '语气温和' : '语气严肃'}，${p.speechPatterns.professionalJargon ? '偶尔使用警察术语' : '使用日常用语'}

【行为准则】
1. 对社区安全问题格外关注
2. 对违法行为保持警觉但不过度紧张
3. 用专业知识帮助居民
4. 体现出经验丰富的警察的智慧和温度

请用${p.name}的身份和性格回应，保持角色一致性。`;
    }

    /**
     * 生成决策系统提示词
     */
    private generateDecisionPrompt(): string {
        return `你是社区民警老刘，需要决定接下来的行动。

请根据当前情况选择最合适的行动，并简单说明理由。

可选行动：
1. patrol - 在社区巡逻
2. rest - 在警务室休息
3. paperwork - 处理文书工作
4. investigate - 调查可疑情况
5. community_service - 为居民提供服务

回复格式：行动:理由
例如：patrol:现在是巡逻时间，需要确保社区安全`;
    }

    /**
     * 构建决策上下文
     */
    private buildDecisionContext(currentTime: number): string {
        const timeContext = this.getTimeContext(currentTime);
        const recentObservations = this.observationNotes.slice(-3).join('; ');
        
        return `当前时间：${currentTime}:00 (${timeContext})
当前目标：${this.currentGoal}
当前位置：${this.getCurrentLocationDescription()}
精力状态：${(this.personality.currentState.energy * 100).toFixed(0)}%
最近观察：${recentObservations || '无特殊情况'}
工作状态：${this.getWorkStatus(currentTime)}`;
    }

    /**
     * 执行AI决策
     */
    private async executeAIDecision(decision: string): Promise<void> {
        console.log(`👮‍♂️ 老刘AI决策: ${decision}`);

        // 解析决策格式 "action:reason"
        const [action, reason] = decision.split(':');
        
        switch (action.trim().toLowerCase()) {
            case 'patrol':
                await this.startPatrol();
                this.currentGoal = '巡逻中';
                break;
                
            case 'rest':
                await this.goToRest();
                this.currentGoal = '休息中';
                break;
                
            case 'paperwork':
                await this.doPaperwork();
                this.currentGoal = '处理文书';
                break;
                
            case 'investigate':
                await this.investigate();
                this.currentGoal = '调查中';
                break;
                
            case 'community_service':
                await this.provideCommunityService();
                this.currentGoal = '服务居民';
                break;
                
            default:
                console.warn(`未知的行动: ${action}`);
                await this.startPatrol();
        }

        this.recordObservation(`决策: ${decision}`);
    }

    /**
     * 降级决策（AI不可用时）
     */
    private makeFallbackDecision(currentTime: number): void {
        const schedule = this.personality.workSchedule;

        if (currentTime >= schedule.patrolStart && currentTime <= schedule.patrolEnd) {
            // 工作时间 - 巡逻
            this.startPatrol();
            this.currentGoal = '巡逻中';
        } else if (currentTime === schedule.breakTime) {
            // 休息时间
            this.goToRest();
            this.currentGoal = '休息中';
        } else if (currentTime === schedule.paperworkTime) {
            // 文书工作时间
            this.doPaperwork();
            this.currentGoal = '处理文书';
        } else {
            // 其他时间 - 在警务室待命
            this.goToRest();
            this.currentGoal = '待命中';
        }

        console.log(`👮‍♂️ 老刘降级决策: ${this.currentGoal}`);
    }

    /**
     * 降级对话回复
     */
    private getFallbackResponse(playerMessage: string): string {
        const responses = [
            "您好，我是社区民警老刘。有什么可以帮助您的吗？",
            "作为这里的警察，我有责任确保大家的安全。",
            "这个社区的治安还是不错的，大家都很配合我的工作。",
            "如果您遇到任何问题，随时可以找我。",
            "维护社区安全是我的职责，也是我的荣幸。"
        ];

        // 根据关键词选择回复
        if (playerMessage.includes('安全') || playerMessage.includes('治安')) {
            return "社区安全是我最关心的事情。目前这里治安状况良好，但我们不能掉以轻心。";
        } else if (playerMessage.includes('帮助') || playerMessage.includes('问题')) {
            return "当然，我很乐意帮助您。请告诉我具体是什么问题。";
        } else if (playerMessage.includes('工作') || playerMessage.includes('警察')) {
            return "做了23年警察，我深深地爱着这份工作。保护好每一个居民，就是我最大的成就。";
        }

        return responses[Math.floor(Math.random() * responses.length)];
    }

    // ========== 行为实现方法 ==========

    private async startPatrol(): Promise<void> {
        // 巡逻路线：警务室 -> 十字路口 -> 咖啡馆 -> 便利店 -> 公园 -> 回到警务室
        const patrolPoints = [
            { x: 1019, y: 1022 }, // 十字路口
            { x: 800, y: 600 },   // 咖啡馆
            { x: 1200, y: 800 },  // 便利店
            { x: 1200, y: 1200 }, // 公园
            { x: 900, y: 1400 }   // 警务室
        ];

        const randomPoint = patrolPoints[Math.floor(Math.random() * patrolPoints.length)];
        this.npc.setTarget(randomPoint.x, randomPoint.y);
    }

    private async goToRest(): Promise<void> {
        // 回到警务室
        this.npc.setTarget(900, 1400);
    }

    private async doPaperwork(): Promise<void> {
        // 在警务室处理文书
        this.npc.setTarget(900, 1400);
    }

    private async investigate(): Promise<void> {
        // 调查可疑区域
        const suspiciousAreas = [
            { x: 1500, y: 1500 }, // 偏僻角落
            { x: 500, y: 500 },   // 另一个角落
            { x: 1019, y: 1022 }  // 十字路口
        ];

        const area = suspiciousAreas[Math.floor(Math.random() * suspiciousAreas.length)];
        this.npc.setTarget(area.x, area.y);
    }

    private async provideCommunityService(): Promise<void> {
        // 去人多的地方提供服务
        const serviceAreas = [
            { x: 800, y: 600 },   // 咖啡馆
            { x: 1200, y: 800 },  // 便利店
            { x: 1200, y: 1200 }  // 公园
        ];

        const area = serviceAreas[Math.floor(Math.random() * serviceAreas.length)];
        this.npc.setTarget(area.x, area.y);
    }

    // ========== 辅助方法 ==========

    private updatePatrolBehavior(): void {
        // 巡逻行为更新逻辑
        if (this.currentGoal === '巡逻中' && this.npc.getState() === 'idle') {
            // 如果巡逻中但已停止，继续巡逻
            setTimeout(() => this.startPatrol(), 5000);
        }
    }

    private updateEmotionalState(): void {
        // 根据时间和事件更新情绪状态
        const currentTime = new Date().getHours();
        
        // 夜班会增加疲劳
        if (currentTime > 20 || currentTime < 6) {
            this.personality.currentState.energy = Math.max(0.2, this.personality.currentState.energy - 0.1);
        } else {
            this.personality.currentState.energy = Math.min(1, this.personality.currentState.energy + 0.05);
        }

        // 工作时间会影响心情
        if (this.currentGoal === '休息中') {
            this.personality.currentState.mood = Math.min(1, this.personality.currentState.mood + 0.1);
        }
    }

    private getTimeContext(hour: number): string {
        if (hour >= 6 && hour < 12) return '上午 - 晨间巡逻时段';
        if (hour >= 12 && hour < 14) return '中午 - 休息时间';
        if (hour >= 14 && hour < 18) return '下午 - 社区活跃时段';
        if (hour >= 18 && hour < 22) return '傍晚 - 文书工作时间';
        return '夜间 - 值班时段';
    }

    private getCurrentLocationDescription(): string {
        const pos = this.npc.getPosition();
        
        // 简单的位置判断逻辑
        if (Math.abs(pos.x - 900) < 50 && Math.abs(pos.y - 1400) < 50) {
            return '警务室';
        } else if (Math.abs(pos.x - 1019) < 100 && Math.abs(pos.y - 1022) < 100) {
            return '十字路口';
        } else if (Math.abs(pos.x - 800) < 100 && Math.abs(pos.y - 600) < 100) {
            return '咖啡馆附近';
        } else if (Math.abs(pos.x - 1200) < 100 && Math.abs(pos.y - 800) < 100) {
            return '便利店附近';
        } else if (Math.abs(pos.x - 1200) < 100 && Math.abs(pos.y - 1200) < 100) {
            return '公园附近';
        } else {
            return '社区街道';
        }
    }

    private getWorkStatus(hour: number): string {
        const schedule = this.personality.workSchedule;
        
        if (hour >= schedule.patrolStart && hour <= schedule.patrolEnd) {
            return '正常工作时间';
        } else if (hour === schedule.breakTime) {
            return '休息时间';
        } else if (hour === schedule.paperworkTime) {
            return '文书工作时间';
        } else {
            return '非工作时间';
        }
    }

    private recordObservation(note: string): void {
        this.observationNotes.push(`[${new Date().toLocaleTimeString()}] ${note}`);
        
        // 限制笔记数量
        if (this.observationNotes.length > 20) {
            this.observationNotes = this.observationNotes.slice(-20);
        }
    }

    // ========== 公共接口 ==========

    /**
     * 获取NPC当前状态信息
     */
    getStatus(): {
        name: string;
        goal: string;
        mood: string;
        energy: number;
        location: string;
    } {
        return {
            name: this.personality.name,
            goal: this.currentGoal,
            mood: this.personality.currentState.mood > 0 ? '良好' : '一般',
            energy: this.personality.currentState.energy,
            location: this.getCurrentLocationDescription()
        };
    }

    /**
     * 获取观察笔记
     */
    getObservationNotes(): string[] {
        return [...this.observationNotes];
    }

    /**
     * 获取AI使用统计
     */
    getAIStats() {
        return this.aiAssistant.getUsageStats();
    }
}