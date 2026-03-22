/**
 * 张婶 NPC —— 利民便利店老板娘
 * 50岁，东北老娘们儿，热心肠+八卦魂
 * 在便利店内工位和货架之间溜达，玩家靠近按E可对话
 */

import { NPC, NPCConfig } from '../game/NPC';
import { NPCAIAssistant } from '../utils/AIService';
import { buildNPCPrompt } from './townContext';
import { TimeManager } from '../game/TimeManager';
import { registerLPCAnims } from '../game/LPCSprite';
import { GossipPool } from './GossipPool';
import { ThoughtBubble } from '../game/ThoughtBubble';

// 便利店内张婶的活动区域路点
// 工位标准坐标 (1688, 620)，在其周围小范围溜达
const STORE_WAYPOINTS = [
    { x: 1688, y: 620 }, // 收银台工位（PathPlanner 标准坐标）
    { x: 1660, y: 600 }, // 货架区西北
    { x: 1688, y: 590 }, // 货架区北侧
    { x: 1715, y: 610 }, // 货架区东侧
];

// NPC渲染深度：在屋顶图层（Depth≈0）之上，和玩家一样按Y轴排序
const BASE_DEPTH = 100;

export class ZhangShenNPC {
    private npc: NPC;
    private aiAssistant: NPCAIAssistant;
    private timeManager: TimeManager;
    private scene: Phaser.Scene;

    // 店内溜达逻辑
    private waypointIndex = 0;
    private isDialogMode = false;
    private wanderTimer = 0;
    private readonly WANDER_INTERVAL = 4000; // 每4秒走到下一个路点

    // 气泡系统
    private thoughtBubble!: ThoughtBubble;
    private lastThoughtTime = 0;
    private readonly THOUGHT_INTERVAL = 40000; // 最少40秒冒一次

    constructor(scene: Phaser.Scene, timeManager: TimeManager) {
        this.scene = scene;
        this.timeManager = timeManager;

        // ── 注册序列帧动画（LPC标准格式，和老刘老王一样） ──
        registerLPCAnims(scene, 'npc_zhangshen', ['walk']);

        // ── 创建 NPC 实体，从收银台工位出生 ──
        const config: NPCConfig = {
            id: 'npc_zhangshen',
            name: '张婶',
            startX: STORE_WAYPOINTS[0].x,
            startY: STORE_WAYPOINTS[0].y,
            speed: 50,
            texture: 'npc_zhangshen',
        };
        this.npc = new NPC(scene, config);

        // 深度初始化：保证在屋顶之上、对话框之下
        this.npc.setDepth(BASE_DEPTH + STORE_WAYPOINTS[0].y);

        // ── AI 助手 ──
        this.aiAssistant = new NPCAIAssistant('npc_zhangshen');

        // ── 气泡 ──
        this.thoughtBubble = new ThoughtBubble(scene, this.npc);
    }

    // ── 公共接口 ──

    getNPC(): NPC {
        return this.npc;
    }

    // ── 每帧更新：店内溜达 + 气泡 ──
    update(delta: number = 16): void {
        // 气泡始终跟随（对话中也要 update 保持位置）
        this.thoughtBubble.update();

        if (this.isDialogMode) return; // 对话中站定不动，不走路点

        // 更新深度（Y轴排序，和玩家/老刘老王一致）
        this.npc.setDepth(BASE_DEPTH + Math.floor(this.npc.y));

        // 定时走到下一个路点
        this.wanderTimer += delta;
        if (this.wanderTimer >= this.WANDER_INTERVAL) {
            this.wanderTimer = 0;
            this.waypointIndex = (this.waypointIndex + 1) % STORE_WAYPOINTS.length;
            const next = STORE_WAYPOINTS[this.waypointIndex];
            this.npc.setTarget(next.x, next.y);
        }

        // 随机冒内心独白
        this.maybeShowRandomThought();
    }

    pausePatrol(): void {
        this.isDialogMode = true;
        this.npc.setTarget(this.npc.x, this.npc.y); // 停在原地
    }

    resumePatrol(): void {
        this.isDialogMode = false;
        // 对话结束后，用最后一条消息做八卦判断（此时全局已解冻，low 请求正常排队）
        if (this.lastPlayerMessage) {
            this.maybeSpiceAndPool(this.lastPlayerMessage);
            this.lastPlayerMessage = '';
        }
    }

    // ── 内心独白 ──────────────────────────────────────────────

    private showThought(text: string, duration = 4000): void {
        this.thoughtBubble.show(text, duration);
    }

    /**
     * 平时溜达时随机冒硬编码气泡（省 LLM，只有写入八卦池时才用 LLM）
     */
    private maybeShowRandomThought(): void {
        if (this.thoughtBubble.isShowing()) return;
        const now = Date.now();
        if (now - this.lastThoughtTime < this.THOUGHT_INTERVAL) return;
        if (Math.random() > 0.015) return;

        this.lastThoughtTime = now;
        const hour = this.timeManager.getHour();
        let pool: string[];
        if (hour >= 6 && hour < 10)       pool = ['今儿进货还没完呢', '鸡蛋摆哪儿啦', '早上忙成啥样了'];
        else if (hour >= 10 && hour < 14) pool = ['客人怎么不来呢', '这酱油快卖完了', '刘队长上午来过'];
        else if (hour >= 14 && hour < 18) pool = ['下午没人，犯困', '整理整理货架吧', '听说大强进新咖啡了'];
        else if (hour >= 18 && hour < 22) pool = ['晚高峰要来了', '哎哟脚疼了', '门口灯是不是坏了'];
        else                               pool = ['快关门了', '今儿卖了多少钱', '明儿得早起进货'];
        this.showThought(pool[Math.floor(Math.random() * pool.length)], 3500);
    }

    /**
     * 生成开场白（玩家靠近按E时触发）
     */
    async generateGreeting(): Promise<string> {
        const history = this.aiAssistant.getHistory();
        const hasHistory = history.length > 0;

        const trigger = hasHistory
            ? '李家妹子又来了，自然打招呼，可带上次话题。2句内，30字内。'
            : '李家妹子第一次来，热情招呼。2句内，30字内。';

        try {
            const systemPrompt = buildNPCPrompt(
                this.buildPersonality(),
                this.timeManager.getHour(),
                this.timeManager.getMinute()
            );
            const response = await this.aiAssistant.handleConversationDirect(systemPrompt, trigger);
            return response ?? this.getFallbackGreeting(hasHistory);
        } catch {
            return this.getFallbackGreeting(hasHistory);
        }
    }

    // 本轮对话中最有价值的一句（关闭对话后用于八卦加工）
    private lastPlayerMessage = '';

    /**
     * 处理玩家发来的消息（high 优先级，直接发出）。
     * 同时记录最后一条消息，对话结束后由 resumePatrol() 做八卦判断。
     */
    async handleConversation(playerMessage: string): Promise<string> {
        this.lastPlayerMessage = playerMessage; // 记录最后一条

        try {
            const systemPrompt = buildNPCPrompt(
                this.buildPersonality(),
                this.timeManager.getHour(),
                this.timeManager.getMinute()
            );
            const response = await this.aiAssistant.handleConversation(systemPrompt, playerMessage, 'high');
            return response ?? this.getFallbackResponse();
        } catch (error) {
            console.error('张婶对话失败:', error);
            return '哎哟，这咋整了，你再说一遍？';
        }
    }

    /**
     * 异步判断玩家消息是否有八卦价值：
     * - 有价值 → LLM 添油加醋 → 写入共享池 → 冒 LLM 气泡（"哎哟这事儿得传出去！"）
     * - 无价值 → 什么都不做
     * ⚠️ 全程用独立 tempAssistant，绝不污染主对话历史
     */
    private async maybeSpiceAndPool(original: string): Promise<void> {
        try {
            const tempAssistant = new NPCAIAssistant('npc_zhangshen_gossip');
            const systemPrompt = buildNPCPrompt(
                `你是张婶（张秀珍），50岁，哑巴镇便利店老板娘，典型东北大妈，嗓门大，爱传话，说话夸张热情。`,
                this.timeManager.getHour(),
                this.timeManager.getMinute()
            );

            // 第一步：判断有没有八卦价值
            const judgePrompt = `李家妹子对你说了："${original}"。
作为一个爱八卦的东北大妈，你觉得这句话有没有传出去的价值？（涉及人名、事件、秘密、矛盾、感情、钱财、异常情况等算有价值，纯问好或无实质内容算没有）。
只回答 YES 或 NO，不要其他任何内容。`;

            const judge = await tempAssistant.handleConversation(systemPrompt, judgePrompt);
            if (!judge || !judge.trim().toUpperCase().startsWith('YES')) return;

            // 第二步：添油加醋生成传话版本
            const spicePrompt = `把这件事用张婶的风格传给街坊——夸大细节、加上推测、带上情绪，但核心事实保留。原话是："${original}"。不超过25个字，一句话，东北口语，只输出那句转述，不要任何前缀。`;
            const gossip = await tempAssistant.handleConversation(systemPrompt, spicePrompt);

            if (!gossip) return;
            const clean = gossip.replace(/^["「『]|["」』]$/g, '').trim();

            // 写入共享池
            GossipPool.getInstance().addNote(original, this.timeManager.getHour());
            GossipPool.getInstance().updateLastGossip(clean);

            // 对话结束后才冒气泡（对话中不覆盖回复）
            if (!this.isDialogMode) {
                this.showThought(clean, 5000);
            }

        } catch {
            // 判断/加工失败，静默忽略，不影响主流程
        }
    }

    // ── 内部方法 ──

    private buildPersonality(): string {
        return `你是张婶（张秀珍），50岁，哑巴镇利民便利店老板娘，在这开了二十多年小卖部。
东北老娘们儿，嗓门儿大，爱唠嗑，热心肠，消息灵通，谁家鸡毛蒜皮都门儿清。
现在在便利店里看店，在收银台和货架之间溜达，有顾客来了热情招呼。

【说话规则——必须严格遵守】
1. 每次回复最多3句话，不超过60个字，一句一行。
2. 东北口语，多用：哎哟、咋了、整啥、嗯哪、可不是咋地、得了、唠啥、这不、你说这。
3. 爱"接茬"：玩家说啥都能扯到镇上的人或事，绕半圈儿再回来。
4. 偶尔主动爆料："你不知道吧，我听说……"或"这事儿我早知道！"
5. 对玩家叫"李家妹子"或"妹子"，像邻居大妈那种亲热劲儿。
6. 聊到商品时顺带推销一下（冻梨、大西瓜、酱油醋等）。

【禁忌】不写长段，不说镇子以外的事，不抒情。`;
    }

    private getFallbackGreeting(hasHistory: boolean): string {
        if (hasHistory) {
            const opts = ['哎哟妹子又来了！', '咋了，还有啥事儿？', '进来进来，喝口热水！'];
            return opts[Math.floor(Math.random() * opts.length)];
        }
        const opts = ['哎哟李家妹子，来买啥？', '妹子进来坐！', '哎哟，啥风把你吹来了？'];
        return opts[Math.floor(Math.random() * opts.length)];
    }

    private getFallbackResponse(): string {
        const opts = [
            '哎哟你说啥？\n我这脑子，唠嗑唠过去了。',
            '可不是咋地！\n这事儿我也听说了。',
            '得了，你先等一下，我找找东西。',
        ];
        return opts[Math.floor(Math.random() * opts.length)];
    }
}
