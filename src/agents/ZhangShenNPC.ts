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
    }

    // ── 公共接口 ──

    getNPC(): NPC {
        return this.npc;
    }

    // ── 每帧更新：店内溜达 ──
    update(delta: number = 16): void {
        if (this.isDialogMode) return; // 对话中站定不动

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
    }

    pausePatrol(): void {
        this.isDialogMode = true;
        this.npc.setTarget(this.npc.x, this.npc.y); // 停在原地
    }

    resumePatrol(): void {
        this.isDialogMode = false;
    }

    /**
     * 生成开场白（玩家靠近按E时触发）
     */
    async generateGreeting(): Promise<string> {
        const history = this.aiAssistant.getHistory();
        const hasHistory = history.length > 0;

        const trigger = hasHistory
            ? '[GREETING] 李家妹子又来了。你们聊过，自然地打招呼，可以提起上次的话题。只输出你说的话，不超过2句，不超过30字。'
            : '[GREETING] 李家妹子第一次来便利店。作为老板娘自然热情地招呼她。只输出你说的话，不超过2句，不超过30字。';

        try {
            const systemPrompt = buildNPCPrompt(
                this.buildPersonality(),
                this.timeManager.getHour(),
                this.timeManager.getMinute()
            );
            const response = await this.aiAssistant.handleConversation(systemPrompt, trigger);
            // 开场白不污染对话历史
            const hist = this.aiAssistant.getHistory();
            (this.aiAssistant as any).conversationHistory = hist.slice(0, -2);
            return response ?? this.getFallbackGreeting(hasHistory);
        } catch {
            return this.getFallbackGreeting(hasHistory);
        }
    }

    /**
     * 处理玩家发来的消息，同时写入八卦池
     */
    async handleConversation(playerMessage: string): Promise<string> {
        // 写入八卦池（宽松筛选在 GossipPool 内部完成）
        GossipPool.getInstance().addNote(playerMessage, this.timeManager.getHour());

        try {
            const systemPrompt = buildNPCPrompt(
                this.buildPersonality(),
                this.timeManager.getHour(),
                this.timeManager.getMinute()
            );
            const response = await this.aiAssistant.handleConversation(systemPrompt, playerMessage);
            return response ?? this.getFallbackResponse();
        } catch (error) {
            console.error('张婶对话失败:', error);
            return '哎哟，这咋整了，你再说一遍？';
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
