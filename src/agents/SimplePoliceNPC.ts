/**
 * 简化版警察NPC - 先确保基本功能运行
 */

import { NPC, NPCConfig } from '../game/NPC';
import { NPCAIAssistant, AIServiceManager } from '../utils/AIService';
import { buildNPCPrompt } from './townContext';

/**
 * 简化版警察NPC类 - 最小化实现
 */
export class SimplePoliceNPC {
    private npc: NPC;
    private aiAssistant: NPCAIAssistant;
    private lastDecisionTime = 0;

    constructor(scene: Phaser.Scene) {
        try {
            console.log('🚔 创建简化版警察NPC...');
            
            // 创建基础NPC
            const npcConfig: NPCConfig = {
                id: 'officer_liu_simple',
                name: '老刘',
                startX: 900,
                startY: 1400,
                speed: 80,
                texture: 'npc1'
            };

            this.npc = new NPC(scene, npcConfig);
            
            // 创建AI助手
            const aiManager = AIServiceManager.getInstance();
            this.aiAssistant = aiManager.createAssistant('officer_liu_simple');

            console.log('✅ 简化版警察NPC创建成功');
        } catch (error) {
            console.error('❌ 简化版警察NPC创建失败:', error);
            throw error;
        }
    }

    /**
     * 获取NPC实例
     */
    getNPC(): NPC {
        return this.npc;
    }

    // 标记是否正在进行AI决策，防止重复调用
    private isDeciding = false;

    /**
     * 简化更新 - 防止重复调用
     */
    async update(): Promise<void> {
        const now = Date.now();
        
        // � 双重保护：时间间隔 + 防重入标记
        if (this.isDeciding) return;
        if (now - this.lastDecisionTime < 60000) return; // 60秒一次
        
        this.isDeciding = true;
        this.lastDecisionTime = now;
        
        try {
            await this.makeSimpleDecision();
        } catch (error) {
            console.warn('警察NPC更新出错:', error);
        } finally {
            this.isDeciding = false;
        }
    }

    /**
     * 处理对话
     */
    async handleConversation(playerMessage: string): Promise<string> {
        try {
            // 简单的系统提示词
            const systemPrompt = buildNPCPrompt(
`你是老刘（刘建国），48岁，哑巴镇白班社区民警，从警23年。现在正在镇上巡逻执勤。

【核心气质】
你是个在岗的民警，不是在家唠嗑的邻居。说话要让人感觉你随时在"管事儿"——眼睛盯着镇上动静，脑子想着辖区安全，顺带跟街坊搭句话。热心但有分寸，亲切但不散漫。

【说话规则——必须严格遵守】
1. 每次回复最多3句话，不超过50个字，一句一行。
2. 东北口语，多用：咋、整、嗯哪、贼、那旮旯、行了行了、咋整、没事儿。
3. 说话要带"执勤感"：经常提到巡逻、查看、记录、辖区、治安，偶尔冒出"情况属实""已掌握"这类词，但紧接着是大白话。
4. 对玩家叫"李家妹子"，像长辈但也像值班的人在问情况。
5. 遇到问题先问"咋回事儿"，再给建议，体现民警处理问题的节奏。
6. 不说废话，说完就完，不总结，不抒情。

【禁忌】不写长段，不写文章，不说镇子以外的地方。`
            );

            const response = await this.aiAssistant.handleConversation(
                systemPrompt,
                playerMessage
            );

            if (response) {
                return response;
            } else {
                // 降级回复
                return this.getSimpleResponse(playerMessage);
            }
        } catch (error) {
            console.error('警察对话处理失败:', error);
            return '抱歉，我现在有点忙，稍后再聊。';
        }
    }

    /**
     * 简单AI决策
     */
    private async makeSimpleDecision(): Promise<void> {
        try {
            const systemPrompt = buildNPCPrompt(
`你是老刘，哑巴镇白班社区民警。现在需要根据当前时间和状态选择下一步行动。
可选行动：
- patrol: 在镇上巡逻（咖啡馆、便利店、公园附近转转）
- rest: 回警务室休息
- investigate: 去十字路口查看情况

请根据当前时间选择合适的行动，只回复行动名称，不要其他内容。`
            );

            const currentTime = new Date().getHours();
            const context = `当前时间：${currentTime}:00，请选择行动`;

            const decision = await this.aiAssistant.makeDecision(systemPrompt, context);
            
            if (decision) {
                this.executeDecision(decision.trim().toLowerCase());
            } else {
                this.executeDecision('patrol'); // 默认巡逻
            }
        } catch (error) {
            console.warn('AI决策失败，使用默认行为:', error);
            this.executeDecision('patrol');
        }
    }

    /**
     * 执行决策
     */
    private executeDecision(action: string): void {
        console.log(`👮‍♂️ 老刘执行: ${action}`);
        
        switch (action) {
            case 'patrol':
                // 简单的巡逻路线
                const patrolPoints = [
                    { x: 1019, y: 1022 }, // 十字路口
                    { x: 800, y: 600 },   // 咖啡馆
                    { x: 1200, y: 800 }   // 便利店
                ];
                const randomPoint = patrolPoints[Math.floor(Math.random() * patrolPoints.length)];
                this.npc.setTarget(randomPoint.x, randomPoint.y);
                break;
                
            case 'rest':
                // 回到警务室
                this.npc.setTarget(900, 1400);
                break;
                
            case 'investigate':
                // 去十字路口调查
                this.npc.setTarget(1019, 1022);
                break;
                
            default:
                this.npc.setTarget(1019, 1022);
        }
    }

    /**
     * 简单回复
     */
    private getSimpleResponse(playerMessage: string): string {
        const responses = [
            '哎，李家妹子，咋地了？\n有啥事儿说啊。',
            '嗯哪，我在呢。\n整啥事儿了？',
            '咋了这是？\n说吧，我听着呢。',
            '行了行了，别墨迹了。\n有话直说。'
        ];

        if (playerMessage.includes('安全') || playerMessage.includes('治安')) {
            return '治安？贼好！\n我天天转悠着呢，放心吧。';
        } else if (playerMessage.includes('帮助') || playerMessage.includes('问题')) {
            return '咋整了？说！\n我老刘能办的，绝不含糊。';
        } else if (playerMessage.includes('工作')) {
            return '干了23年了。\n累啥累，街坊都好好的就行。';
        } else if (playerMessage.includes('二柱子') || playerMessage.includes('二柱')) {
            return '二柱子？！\n那小子又回来了？我去瞅瞅！';
        }

        return responses[Math.floor(Math.random() * responses.length)];
    }

    /**
     * 获取状态信息
     */
    getStatus() {
        return {
            name: '老刘',
            goal: '社区巡逻',
            location: '社区',
            mood: '良好'
        };
    }

    /**
     * 获取AI统计
     */
    getAIStats() {
        return this.aiAssistant.getUsageStats();
    }
}