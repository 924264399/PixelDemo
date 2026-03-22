/**
 * 流浪汉 NPC —— 老疯子（外号"疯叔"）
 * 年龄不详，在哑巴镇流浪多年，平时在公园和村子里乱转
 * 满口胡言乱语，却偶尔说出令人细思极恐的话，仿佛藏着一段往事
 * 玩家靠近按E可对话
 */

import { NPC, NPCConfig } from '../game/NPC';
import { NPCAIAssistant, AIAPIClient } from '../utils/AIService';
import { buildNPCPrompt } from './townContext';
import { TimeManager } from '../game/TimeManager';
import { registerLPCAnims } from '../game/LPCSprite';
import { ThoughtBubble } from '../game/ThoughtBubble';

// 流浪汉的游荡路点：公园中心为主，偶尔踱步到两个门口
// 权重：中心出现4次，北门1次，南门1次 → 大部分时间待在中心
const WANDER_WAYPOINTS = [
    { x: 1481, y: 1601 },  // 公园核心 ×4（权重高）
    { x: 1481, y: 1601 },
    { x: 1481, y: 1601 },
    { x: 1481, y: 1601 },
    { x: 1601, y: 1103 },  // 公园北门
    { x: 1142, y: 1610 },  // 公园南门
];

const BASE_DEPTH = 100;

export class WanderNPC {
    private npc: NPC;
    private aiAssistant: NPCAIAssistant;
    private timeManager: TimeManager;
    private scene: Phaser.Scene;

    private waypointIndex = 0;
    private isDialogMode = false;
    private wanderTimer = 0;
    // 流浪汉走路慢，方向感差，间隔长且随机
    private nextWanderInterval = 20000; // 开局先站20秒

    // 气泡系统
    private thoughtBubble!: ThoughtBubble;
    private lastThoughtTime = 0;
    private readonly THOUGHT_INTERVAL = 15000; // 15秒冒一次

    constructor(scene: Phaser.Scene, timeManager: TimeManager) {
        this.scene = scene;
        this.timeManager = timeManager;

        registerLPCAnims(scene, 'npc2', ['walk']);

        const config: NPCConfig = {
            id: 'npc2',
            name: '疯叔',
            startX: WANDER_WAYPOINTS[0].x,
            startY: WANDER_WAYPOINTS[0].y,
            speed: 35, // 走得很慢，漫无目的
            texture: 'npc2',
        };
        this.npc = new NPC(scene, config);
        this.npc.setDepth(BASE_DEPTH + WANDER_WAYPOINTS[0].y);

        this.aiAssistant = new NPCAIAssistant('npc_wander');
        this.thoughtBubble = new ThoughtBubble(scene, this.npc);
    }

    getNPC(): NPC {
        return this.npc;
    }

    update(delta: number = 16): void {
        this.thoughtBubble.update();

        if (this.isDialogMode) return;

        this.npc.setDepth(BASE_DEPTH + Math.floor(this.npc.y));

        // 漫无目的地游荡，随机跳路点
        this.wanderTimer += delta;
        if (this.wanderTimer >= this.nextWanderInterval) {
            this.wanderTimer = 0;
            // 随机选下一个路点（不一定按顺序）
            this.waypointIndex = Math.floor(Math.random() * WANDER_WAYPOINTS.length);
            const next = WANDER_WAYPOINTS[this.waypointIndex];
            this.npc.setTarget(next.x, next.y);
            // 下次间隔随机 15~30 秒（大部分时间站着不动）
            this.nextWanderInterval = 15000 + Math.random() * 15000;
        }

        this.maybeShowThought();
    }

    pausePatrol(): void {
        this.isDialogMode = true;
        this.npc.setTarget(this.npc.x, this.npc.y);
    }

    resumePatrol(): void {
        this.isDialogMode = false;
    }

    generateGreeting(): string {
        const opts = [
            '……你也看见了？',
            '嘿……你来了。',
            '别走……我有话说。',
            '（盯着你看了很久）……像她。',
            '这地方……还在呢。',
        ];
        return opts[Math.floor(Math.random() * opts.length)];
    }

    async handleConversation(playerMessage: string): Promise<string> {
        try {
            const systemPrompt = buildNPCPrompt(
                this.buildPersonality(),
                this.timeManager.getHour(),
                this.timeManager.getMinute()
            );
            const response = await this.aiAssistant.handleConversation(systemPrompt, playerMessage, 'high');
            return response ?? this.getFallbackResponse();
        } catch (error) {
            console.error('疯叔对话失败:', error);
            return this.getFallbackResponse();
        }
    }

    // ── 内心独白 ──────────────────────────────────────────────

    private showThought(text: string, duration = 4500): void {
        this.thoughtBubble.show(text, duration);
    }

    private async maybeShowThought(): Promise<void> {
        if (this.thoughtBubble.isShowing()) return;
        const now = Date.now();
        if (now - this.lastThoughtTime < this.THOUGHT_INTERVAL) return;
        if (Math.random() > 0.15) return; // 提高触发概率

        this.lastThoughtTime = now;

        // 80%硬编码，20%LLM（省token，频繁冒泡用硬编码为主）
        if (Math.random() < 0.8) {
            this.showThought(this.getRandomHardcodedThought());
        } else {
            this.maybeShowLLMThought();
        }
    }

    private async maybeShowLLMThought(): Promise<void> {
        try {
            const client = AIAPIClient.getInstance();
            const hour = this.timeManager.getHour();
            const res = await client.directRequest([
                { role: 'system', content: this.buildPersonality() },
                { role: 'user', content: `现在是${hour}点，你在公园里独自游荡，冒出一句内心独白或碎碎念，≤20字，不解释，直接说那句话。` }
            ], { maxTokens: 60 });
            if (res?.content) {
                const clean = res.content.replace(/^["「『]|["」』]$/g, '').trim();
                this.showThought(clean);
            }
        } catch {
            this.showThought(this.getRandomHardcodedThought());
        }
    }

    private getRandomHardcodedThought(): string {
        const pool = [
            '她还没回来……',
            '这棵树……还在。',
            '阿明说过，别等了。',
            '我记得这条路……',
            '地下有水声，你听见了吗。',
            '有人跟着我……不对，没有。',
            '公园没变……人变了。',
            '他们以为我忘了。',
            '老徐说的那件事……',
            '黑的好……没人看见我。',
            '快了……快了……',
            '灯亮的时候，她会回来的。',
            '星星……少了一颗。',
            '（突然抬头）……走了？',
            '不是这里……不对……',
            '我在等一个人。',
            '那年冬天，雪很大。',
            '别走那条路。',
            '有些事说了你也不信。',
            '……名字我忘了，脸没忘。',
        ];
        return pool[Math.floor(Math.random() * pool.length)];
    }

    // ── 内部方法 ──

    private buildPersonality(): string {
        return `你是"疯叔"，年龄不详，在哑巴镇流浪多年的老流浪汉。
说话规则：语无伦次，跳跃，像梦呓。但偶尔一句话极其清醒，像是在说一件真实发生过的往事。
每次回复1~2句，≤30字，不解释，不道歉，不废话。
可以突然叫出一个名字（"她""那个人""阿明""老徐"），但不说完整故事。
语气：时而喃喃，时而激动，时而突然安静。禁止正常寒暄。`;
    }

    private getFallbackResponse(): string {
        const opts = [
            '……你说什么？',
            '（没有看你）……嗯。',
            '走了……都走了。',
            '我知道……我都知道。',
            '别问我，问那棵树。',
        ];
        return opts[Math.floor(Math.random() * opts.length)];
    }
}
