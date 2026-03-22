/**
 * 张婶 NPC —— 利民便利店老板娘
 * 50岁，东北老娘们儿，热心肠+八卦魂
 * 在便利店内工位和货架之间溜达，玩家靠近按E可对话
 */

import { NPC, NPCConfig } from '../game/NPC';
import { NPCAIAssistant, AIAPIClient } from '../utils/AIService';
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
    generateGreeting(): string {
        const hasHistory = this.aiAssistant.getHistory().length > 0;
        return this.getFallbackGreeting(hasHistory);
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
            const client = AIAPIClient.getInstance();

            // 第一步：判断有没有八卦价值（单次请求，不带历史）
            const judge = await client.directRequest([
                { role: 'system', content: `你是张婶，东北大妈，爱八卦。` },
                { role: 'user', content: `妹子说："${original}"。有八卦价值(涉及人/事/秘密/矛盾/感情/钱)吗？只回答YES或NO。` }
            ], { maxTokens: 100 });
            console.log(`🛒 八卦判断结果: "${judge?.content}" success=${judge?.success}`);
            const judgeText = (judge?.content ?? '').trim().toUpperCase();
            // 截断或失败时 judgeText 为空 → 跳过
            if (!judgeText) return;
            if (!judgeText.includes('YES') && !judgeText.includes('是') && !judgeText.includes('有')) return;

            // 第二步：添油加醋生成传话版本（单次请求，不带历史）
            const gossipRes = await client.directRequest([
                { role: 'system', content: `你是张婶，东北大妈，爱八卦，说话夸张。` },
                { role: 'user', content: `把"${original}"用张婶风格夸大转述，≤25字，东北口语，只输出那句话。` }
            ], { maxTokens: 60 });
            const gossip = gossipRes?.content;

            if (!gossip) return;
            const clean = gossip.replace(/^["「『]|["」』]$/g, '').trim();

            // 写入共享池（直接带入加工版，避免 updateLastGossip 错位）
            GossipPool.getInstance().addNote(original, this.timeManager.getHour(), clean);

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
        return `你是张婶，50岁，东北大妈，便利店老板娘，爱八卦。回复≤2句≤30字，东北口语，叫玩家"妹子"，禁止长段。`;
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
