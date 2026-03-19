/**
 * 夜班警察 NPC —— 老王（王大春）
 * 47岁，夜班社区民警，从警22年
 */

import { NPC, NPCConfig } from '../game/NPC';
import { NPCAIAssistant, AIServiceManager } from '../utils/AIService';
import { buildNPCPrompt } from './townContext';

export class NightPoliceNPC {
    private npc: NPC;
    private aiAssistant: NPCAIAssistant;
    private lastDecisionTime = 0;
    private isDeciding = false;

    constructor(scene: Phaser.Scene) {
        try {
            console.log('🌙 创建夜班警察NPC 老王...');

            const npcConfig: NPCConfig = {
                id: 'officer_wang_night',
                name: '老王',
                startX: 950,
                startY: 1450,
                speed: 70,
                texture: 'npc_police2'
            };

            this.npc = new NPC(scene, npcConfig);

            const aiManager = AIServiceManager.getInstance();
            this.aiAssistant = aiManager.createAssistant('officer_wang_night');

            console.log('✅ 老王上岗，夜班开始！');
        } catch (error) {
            console.error('❌ 老王创建失败:', error);
            throw error;
        }
    }

    getNPC(): NPC {
        return this.npc;
    }

    async update(): Promise<void> {
        const now = Date.now();
        if (this.isDeciding) return;
        if (now - this.lastDecisionTime < 60000) return;

        this.isDeciding = true;
        this.lastDecisionTime = now;

        try {
            await this.makeDecision();
        } catch (error) {
            console.warn('老王更新出错:', error);
        } finally {
            this.isDeciding = false;
        }
    }

    async handleConversation(playerMessage: string): Promise<string> {
        try {
            const systemPrompt = buildNPCPrompt(
`你是老王（王大春），47岁，哑巴镇夜班社区民警，从警22年。现在是夜班执勤，正在镇上巡逻。

【核心气质】
你是个话少、眼尖的夜班民警。不爱多说，但说出来都是干货。脸黑看着凶，实则心细，专挑犄角旮旯走，连公园树后藏的野猫都能瞅见。媳妇去城里帮闺女带娃了，你把铺盖搬进警务室，夜里随时出警。

【说话规则——必须严格遵守】
1. 每次回复最多2句话，不超过35个字，一句一行。
2. 话比老刘少，更简，更冷，但不是冷漠，是专注。
3. 东北口语，用：嗯、行、没事儿、瞅啥、整啥、知道了、盯着呢。
4. 说话带夜班执勤感：夜里安静但不放松，随时在观察，偶尔提到"夜里""黑灯瞎火""犄角旮旯"。
5. 对玩家叫"李家妹子"，语气简短但不失亲切。
6. 遇到异常情况（如有人鬼鬼祟祟）反应敏锐，立刻追问细节。

【禁忌】不写长段，不抒情，不废话，不说镇子以外的地方。`
            );

            const response = await this.aiAssistant.handleConversation(
                systemPrompt,
                playerMessage
            );

            return response ?? this.getFallbackResponse(playerMessage);
        } catch (error) {
            console.error('老王对话处理失败:', error);
            return '有事儿说。';
        }
    }

    private async makeDecision(): Promise<void> {
        try {
            const systemPrompt = buildNPCPrompt(
`你是老王，哑巴镇夜班社区民警。根据当前时间选择行动。
可选行动：
- patrol: 在镇上夜巡（公园、犄角旮旯、警务室周边）
- rest: 在警务室待命
- investigate: 去某个可疑地点查看

只回复行动名称，不要其他内容。`
            );

            const currentHour = new Date().getHours();
            const context = `当前时间：${currentHour}:00，夜班执勤中，请选择行动`;

            const decision = await this.aiAssistant.makeDecision(systemPrompt, context);
            this.executeDecision(decision?.trim().toLowerCase() ?? 'patrol');
        } catch (error) {
            console.warn('老王AI决策失败，默认巡逻:', error);
            this.executeDecision('patrol');
        }
    }

    private executeDecision(action: string): void {
        console.log(`🌙 老王执行: ${action}`);

        switch (action) {
            case 'patrol':
                const patrolPoints = [
                    { x: 1019, y: 1022 }, // 十字路口
                    { x: 780,  y: 650  }, // 公园周边
                    { x: 1100, y: 900  }, // 犄角旮旯
                ];
                const pt = patrolPoints[Math.floor(Math.random() * patrolPoints.length)];
                this.npc.setTarget(pt.x, pt.y);
                break;
            case 'rest':
                this.npc.setTarget(950, 1450); // 警务室
                break;
            case 'investigate':
                this.npc.setTarget(1019, 1022);
                break;
            default:
                this.npc.setTarget(950, 1450);
        }
    }

    private getFallbackResponse(playerMessage: string): string {
        if (playerMessage.includes('二柱') || playerMessage.includes('二柱子')) {
            return '二柱子？\n在哪旮旯见着的，说！';
        }
        if (playerMessage.includes('安全') || playerMessage.includes('治安')) {
            return '盯着呢，放心。\n夜里我不睡。';
        }
        if (playerMessage.includes('夜') || playerMessage.includes('晚')) {
            return '夜里少出来。\n有事儿找我。';
        }
        const responses = [
            '嗯。\n有啥事儿？',
            '说吧。',
            '李家妹子，这么晚咋还在外头？',
            '行了，我听着呢。',
        ];
        return responses[Math.floor(Math.random() * responses.length)];
    }

    /** 对话开始：暂停巡逻 */
    pausePatrol(): void {
        this.npc.setTalking();
    }

    /** 对话结束：恢复巡逻 */
    resumePatrol(): void {
        this.npc.setIdle();
    }

    getStatus() {
        return {
            name: '老王',
            goal: '夜间巡逻',
            location: '警务室周边',
            mood: '警觉'
        };
    }

    getAIStats() {
        return this.aiAssistant.getUsageStats();
    }
}
