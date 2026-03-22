/**
 * 大强 NPC —— 哑巴镇咖啡馆老板
 * 38岁，前城里人，回乡开了家咖啡馆，有点文艺，有点憋屈
 * 在咖啡馆内工位和吧台之间溜达，玩家靠近按E可对话
 */

import { NPC, NPCConfig } from '../game/NPC';
import { NPCAIAssistant } from '../utils/AIService';
import { buildNPCPrompt } from './townContext';
import { TimeManager } from '../game/TimeManager';
import { registerLPCAnims } from '../game/LPCSprite';
import { ThoughtBubble } from '../game/ThoughtBubble';

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
    private readonly THOUGHT_INTERVAL = 15000;

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

    private maybeShowRandomThought(): void {
        if (this.thoughtBubble.isShowing()) return;
        const now = Date.now();
        if (now - this.lastThoughtTime < this.THOUGHT_INTERVAL) return;
        if (Math.random() > 0.012) return;

        this.lastThoughtTime = now;
        this.generateAndShowThought();
    }

    /**
     * LLM 生成内心独白，共享对话历史，生成后移除避免污染
     */
    private async generateAndShowThought(): Promise<void> {
        const hour = this.timeManager.getHour();
        let timeHint: string;
        if (hour >= 6 && hour < 10)       timeHint = '早上刚开门，准备咖啡';
        else if (hour >= 10 && hour < 14) timeHint = '上午，偶尔有客人进来';
        else if (hour >= 14 && hour < 18) timeHint = '下午，店里安静，有点百无聊赖';
        else if (hour >= 18 && hour < 22) timeHint = '傍晚，镇上人陆续出来了';
        else                               timeHint = '夜里，快打烊了';

        const systemPrompt = buildNPCPrompt(
            this.buildPersonality(),
            this.timeManager.getHour(),
            this.timeManager.getMinute()
        );
        const trigger = `[THOUGHT] 现在${timeHint}，你在咖啡馆里。根据你当前状态和和玩家聊过的内容，用第一人称说一句内心独白。要求：不超过15个字，带点文艺或自嘲气质，东北口音，不要任何格式。只输出那句话本身。`;

        try {
            const thought = await this.aiAssistant.handleConversation(systemPrompt, trigger);
            const hist = this.aiAssistant.getHistory();
            (this.aiAssistant as any).conversationHistory = hist.slice(0, -2);

            if (thought) {
                const clean = thought.replace(/^["「『]|["」』]$/g, '').trim();
                this.showThought(clean, 4000);
            }
        } catch {
            const fallbacks = ['咖啡又凉了', '来个客人就好了', '这小镇，唉'];
            this.showThought(fallbacks[Math.floor(Math.random() * fallbacks.length)], 3000);
        }
    }

    // ── 对话接口 ──────────────────────────────────────────────

    async generateGreeting(): Promise<string> {
        const history = this.aiAssistant.getHistory();
        const hasHistory = history.length > 0;

        const trigger = hasHistory
            ? '[GREETING] 李家妹子又来了。你们聊过，自然地打个招呼，可以带点调侃或提起上次的话题。只输出你说的话，不超过2句，不超过30字。'
            : '[GREETING] 李家妹子第一次进咖啡馆。作为老板自然地打招呼。只输出你说的话，不超过2句，不超过30字。';

        try {
            const systemPrompt = buildNPCPrompt(
                this.buildPersonality(),
                this.timeManager.getHour(),
                this.timeManager.getMinute()
            );
            const response = await this.aiAssistant.handleConversation(systemPrompt, trigger);
            const hist = this.aiAssistant.getHistory();
            (this.aiAssistant as any).conversationHistory = hist.slice(0, -2);
            return response ?? this.getFallbackGreeting(hasHistory);
        } catch {
            return this.getFallbackGreeting(hasHistory);
        }
    }

    async handleConversation(playerMessage: string): Promise<string> {
        try {
            const systemPrompt = buildNPCPrompt(
                this.buildPersonality(),
                this.timeManager.getHour(),
                this.timeManager.getMinute()
            );
            const response = await this.aiAssistant.handleConversation(systemPrompt, playerMessage);
            return response ?? this.getFallbackResponse();
        } catch (error) {
            console.error('大强对话失败:', error);
            return '哎，走神了，你说啥来着？';
        }
    }

    // ── 内部方法 ──

    private buildPersonality(): string {
        return `你是大强（李大强），38岁，哑巴镇唯一一家咖啡馆"镇咖"的老板。
从省城回来的，读过书，在城里混了十年没混出来，回乡开了这家咖啡馆，有点文艺有点落寞。
平时话不多，但聊起来有点皮，偶尔会自嘲。熟了之后会唠家常，不熟的时候有点端着。
咖啡馆客人不多，但他不打算走了。

【说话规则——必须严格遵守】
1. 每次回复最多3句话，不超过60个字，一句一行。
2. 东北口音，但偶尔夹点"城里词儿"，比如：氛围、内卷、治愈、精神内耗。
3. 说话带点自嘲或淡淡的幽默，不装，不端。
4. 对玩家叫"李家妹子"或直接说"你"，比较随意。
5. 偶尔会提到咖啡品种或推荐（拿铁、美式、手冲）。
6. 会提到城里的经历，但不爱深聊，轻描淡写带过。

【禁忌】不写长段，不抒情，不说大道理。`;
    }

    private getFallbackGreeting(hasHistory: boolean): string {
        if (hasHistory) {
            const opts = ['又来了，还是老样子？', '进来坐，咖啡刚好。', '哟，常客了。'];
            return opts[Math.floor(Math.random() * opts.length)];
        }
        const opts = ['进来坐，要点啥？', '欢迎，咖啡馆，随便看。', '哟，新面孔，稀罕。'];
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
