/**
 * 大强 NPC —— 哑巴镇咖啡馆老板
 * 38岁，前慈祥，回乡开了家咖啡馆，有点文艺，有点炕上华盛
 * 在咖啡馆内工位和实录间溜达，玩家靠近按E可对话
 */

import { NPC, NPCConfig } from '../game/NPC';
import { NPCAIAssistant } from '../utils/AIService';
import { buildNPCPrompt } from './townContext';
import { TimeManager } from '../game/TimeManager';
import { registerLPCAnims } from '../game/LPCSprite';
import { ThoughtBubble } from '../game/ThoughtBubble';
import { GossipPool } from './GossipPool';

// 咖啡馆内大强的活动区域路点
// 工位标准坐标 (911, 455)，在其周围小范围溜达
const CAFE_WAYPOINTS = [
    { x: 911, y: 455 }, // 吧台工位（标准坐标）
    { x: 893, y: 442 }, // 吧台左侧
    { x: 929, y: 442 }, // 吧台右侧
    { x: 911, y: 468 }, // 吧台前侧
];

const BASE_DEPTH = 100;

export class DaQiangNPC {
    private npc: NPC;
    private aiAssistant: NPCAIAssistant;
    private timeManager: TimeManager;
    private scene: Phaser.Scene;

    // 店内溜达逻辑
    private waypointIndex = 0;
    private isDialogMode = false;
    private wanderTimer = 0;
    private readonly WANDER_INTERVAL = 5000; // 每5秒走到下一个路点，节奏慢一点

    // 气泡系统
    private thoughtBubble!: ThoughtBubble;
    private lastThoughtTime = 0;
    private readonly THOUGHT_INTERVAL = 40000;
    private lastGossipCount = 0; // 记录上次检查时的八卦池条数

    constructor(scene: Phaser.Scene, timeManager: TimeManager) {
        this.scene = scene;
        this.timeManager = timeManager;

        registerLPCAnims(scene, 'npc_daqiang', ['walk']);

        const config: NPCConfig = {
            id: 'npc_daqiang',
            name: '大强',
            startX: CAFE_WAYPOINTS[0].x,
            startY: CAFE_WAYPOINTS[0].y,
            speed: 45,
            texture: 'npc_daqiang',
        };
        this.npc = new NPC(scene, config);
        this.npc.setDepth(BASE_DEPTH + CAFE_WAYPOINTS[0].y);

        this.aiAssistant = new NPCAIAssistant('npc_daqiang');
        this.thoughtBubble = new ThoughtBubble(scene, this.npc);
    }

    getNPC(): NPC {
        return this.npc;
    }

    // ── 每帧更新：店内溜达 + 气泡 ──
    update(delta: number = 16): void {
        this.thoughtBubble.update();

        if (this.isDialogMode) return;

        this.npc.setDepth(BASE_DEPTH + Math.floor(this.npc.y));

        this.wanderTimer += delta;
        if (this.wanderTimer >= this.WANDER_INTERVAL) {
            this.wanderTimer = 0;
            this.waypointIndex = (this.waypointIndex + 1) % CAFE_WAYPOINTS.length;
            const next = CAFE_WAYPOINTS[this.waypointIndex];
            this.npc.setTarget(next.x, next.y);
        }

        this.maybeShowRandomThought();
    }

    pausePatrol(): void {
        this.isDialogMode = true;
        this.npc.setTarget(this.npc.x, this.npc.y);
    }

    resumePatrol(): void {
        this.isDialogMode = false;
    }

    // ── 内心独白 ──────────────────────────────────────────────

    private showThought(text: string, duration = 4000): void {
        this.thoughtBubble.show(text, duration);
    }

    /**
     * 平时溜达时随机冒硬编码气泡；
     * 同时检测八卦池是否有新内容，有则触发 LLM 吃瓜反应气泡。
     */
    private maybeShowRandomThought(): void {
        // 优先：检测八卦池是否有新消息
        const pool = GossipPool.getInstance();
        const currentCount = pool.count();
        if (currentCount > this.lastGossipCount && !this.thoughtBubble.isShowing()) {
            this.lastGossipCount = currentCount;
            this.generateGossipReaction(pool.getLatest()?.gossip ?? pool.getLatest()?.original ?? '');
            return;
        }

        // 普通：硬编码定时气泡
        if (this.thoughtBubble.isShowing()) return;
        const now = Date.now();
        if (now - this.lastThoughtTime < this.THOUGHT_INTERVAL) return;
        if (Math.random() > 0.015) return;

        this.lastThoughtTime = now;
        const hour = this.timeManager.getHour();
        let hardPool: string[];
        if (hour >= 6 && hour < 10)       hardPool = ['咖啡豆昨儿到了', '今天能来几个客', '机器预热一下'];
        else if (hour >= 10 && hour < 14) hardPool = ['拿铁还有存货', '这旮旯适合发呆', '要不要换个菜单'];
        else if (hour >= 14 && hour < 18) hardPool = ['下午场人少，舒服', '音乐换首吧', '咖啡又凉了'];
        else if (hour >= 18 && hour < 22) hardPool = ['傍晚来人了', '今儿收入咋样', '镇上热闹起来了'];
        else                               hardPool = ['快关门了', '今儿还不赖', '明天早点开门'];
        this.showThought(hardPool[Math.floor(Math.random() * hardPool.length)], 3500);
    }

    /**
     * 收到新八卦时，用 LLM 生成大强的吃瓜/评论气泡
     * 用独立 tempAssistant，不污染主对话历史
     */
    private async generateGossipReaction(gossipText: string): Promise<void> {
        if (!gossipText) return;
        try {
            const tempAssistant = new NPCAIAssistant('npc_daqiang_reaction');
            const systemPrompt = buildNPCPrompt(
                `你是大强（李大强），38岁，哑巴镇咖啡馆老板，从城里回来的，有点文艺有点皮，东北口音，偶尔夹城里词儿。`,
                this.timeManager.getHour(),
                this.timeManager.getMinute()
            );
            const trigger = `张婶刚传过来一个消息："${gossipText}"。你听到了，用第一人称说一句心里话或吃瓜评论。要求：不超过15个字，带点调侃或自嘲，东北口音，不要任何格式，只输出那句话。`;
            const reaction = await tempAssistant.handleConversation(systemPrompt, trigger);
            if (reaction) {
                const clean = reaction.replace(/^["「『]|["」』]$/g, '').trim();
                this.showThought(clean, 5000);
            }
        } catch {
            // 静默忽略
        }
    }

    // ── 对话接口 ──────────────────────────────────────────────

    generateGreeting(): string {
        const hasHistory = this.aiAssistant.getHistory().length > 0;
        return this.getFallbackGreeting(hasHistory);
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
            console.error('大强对话失败:', error);
            return '哎，走神了，你说啥来着？';
        }
    }

    // ── 内部方法 ──

    private buildPersonality(): string {
        const gossip = GossipPool.getInstance().toPromptString();
        return `你是大强（李大强），38岁，哑巴镇唯一一家咖啡馆"镇咖"的老板。
从省城回来的，读过书，在城里混了十年没混出来，回乡开了这家咖啡馆，有点文艺有点落寞。
平时话不多，但聊起来有点皮，偶尔会自嘲。熟了之后会唠家常，不熟的时候有点端着。
咖啡馆是镇上年轻人的聚集地，消息灵通，张婶传来的八卦你基本都听说过。

【说话规则——必须严格遵守】
1. 每次回复最多3句话，不超过60个字，一句一行。
2. 东北口音，但偶尔夹点"城里词儿"，比如：氛围、内卷、治愈、精神内耗。
3. 说话带点自嘲或淡淡的幽默，不装，不端。
4. 对玩家叫"李家妹子"或直接说"你"，比较随意。
5. 偶尔会提到咖啡品种或推荐（拿铁、美式、手冲）。
6. 可以自然提及从张婶那儿听来的街坊消息，但加一句"张婶说的，不一定准"。

【禁忌】不写长段，不抒情，不说大道理。${gossip}`;
    }

    private getFallbackGreeting(hasHistory: boolean): string {
        if (hasHistory) {
            const opts = [
                '又来了，还是老样子？',
                '进来坐，咖啡刚好。',
                '哟，常客了。',
                '来了，今天喝点啥？',
                '坐吧，我给你整一杯。',
            ];
            return opts[Math.floor(Math.random() * opts.length)];
        }
        const opts = [
            '进来坐，要点啥？',
            '哟，新面孔，稀罕。',
            '欢迎，随便看。',
            '李家妹子？头回来吧，坐。',
            '进来进来，今天有手冲。',
        ];
        return opts[Math.floor(Math.random() * opts.length)];
    }

    private getFallbackResponse(): string {
        const opts = [
            '嗯，有点意思。\n我想想。',
            '这事儿嘛，复杂。\n你喝咖啡吗？',
            '走神了，你再说一遍？',
        ];
        return opts[Math.floor(Math.random() * opts.length)];
    }
}