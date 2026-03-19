/**
 * 白班警察 NPC —— 老刘（刘建国）
 * 48岁，白班社区民警，10:00-22:00 巡逻
 */

import { NPC, NPCConfig, NPCState } from '../game/NPC';
import { NPCAIAssistant, AIServiceManager } from '../utils/AIService';
import { buildNPCPrompt } from './townContext';
import { TimeManager } from '../game/TimeManager';
import { ThoughtBubble } from '../game/ThoughtBubble';
import { ShiftHandoffPool } from './ShiftHandoffPool';

// ── 关键路径节点（基于 MainScene.ts 实际验证坐标）──────────────
const WAYPOINTS = {
    SPAWN:        { x: 200,  y: 1022 }, // 地图外出生地（镇西，沿主路方向）
    TOWN_ENTRY:   { x: 600,  y: 1022 }, // 镇入口（主路西端）
    CROSS_ROAD:   { x: 1019, y: 1022 }, // 十字路口（核心中转节点）
    CAFE:         { x: 992,  y: 820  }, // 咖啡馆门口
    CAFE_ROAD:    { x: 1019, y: 820  }, // 咖啡馆前的主路节点
    STORE:        { x: 1601, y: 845  }, // 便利店门口
    STORE_ROAD:   { x: 1601, y: 1022 }, // 便利店前的主路节点
    PARK_NORTH:   { x: 1601, y: 1103 }, // 公园入口（北）
    PARK_CORE:    { x: 1481, y: 1601 }, // 公园核心
    PARK_SOUTH:   { x: 1142, y: 1610 }, // 公园入口（南）
};

// 工作状态下的随机巡逻目标
const PATROL_DESTINATIONS = [
    WAYPOINTS.CROSS_ROAD,
    WAYPOINTS.CAFE,
    WAYPOINTS.STORE,
    WAYPOINTS.PARK_NORTH,
    WAYPOINTS.PARK_CORE,
    WAYPOINTS.PARK_SOUTH,
];

/** 给路径节点加随机抖动，避免多NPC重叠在同一个像素（范围刻意保持小，防止抖进障碍物） */
function jitter(p: { x: number; y: number }, range = 10): { x: number; y: number } {
    return {
        x: p.x + Math.round((Math.random() - 0.5) * range * 2),
        y: p.y + Math.round((Math.random() - 0.5) * range * 2),
    };
}

/**
 * 根据起点和终点，插入必要的中间路径节点（每个节点带随机抖动）
 */
function buildPath(
    from: { x: number; y: number },
    to: { x: number; y: number }
): { x: number; y: number }[] {
    const mid: { x: number; y: number }[] = [];

    // 从镇外出发时，先经过镇入口（入口抖动小一点，别出界）
    if (from.x < 650) {
        mid.push(jitter(WAYPOINTS.TOWN_ENTRY, 8));
    }

    // 起点或终点不在主路附近时，经过十字路口中转
    const onMainRoad = (p: { x: number; y: number }) =>
        Math.abs(p.y - WAYPOINTS.CROSS_ROAD.y) < 200;

    if (!onMainRoad(from) || !onMainRoad(to)) {
        mid.push(jitter(WAYPOINTS.CROSS_ROAD, 10));
    }

    // 目的地本身也稍微抖一下
    return [...mid, jitter(to, 10)];
}

// ── 工作状态机 ────────────────────────────────────────────────
type PatrolPhase = 'off_duty' | 'entering' | 'on_duty' | 'going_home';

export class SimplePoliceNPC {
    private npc: NPC;
    private aiAssistant: NPCAIAssistant;
    private timeManager: TimeManager;

    private phase: PatrolPhase = 'off_duty';
    private waypointQueue: { x: number; y: number }[] = [];
    private lastPatrolTime = 0;
    private readonly PATROL_INTERVAL = 8000;

    private thoughtBubble!: ThoughtBubble;
    private lastThoughtTime = 0;
    private readonly THOUGHT_INTERVAL = 18000; // 随机内心独白间隔 18 秒

    constructor(scene: Phaser.Scene, timeManager: TimeManager) {
        console.log('🚔 创建老刘（白班警察）...');

        const npcConfig: NPCConfig = {
            id: 'officer_liu',
            name: '老刘',
            startX: WAYPOINTS.SPAWN.x,
            startY: WAYPOINTS.SPAWN.y,
            speed: 80,
            texture: 'npc_police1',
        };

        this.npc = new NPC(scene, npcConfig);
        this.timeManager = timeManager;

        const aiManager = AIServiceManager.getInstance();
        this.aiAssistant = aiManager.createAssistant('officer_liu');

        this.thoughtBubble = new ThoughtBubble(scene, this.npc);

        // 未上班前隐藏在地图外
        this.npc.setVisible(false);
        console.log('✅ 老刘待命，等待10点上班');
    }

    getNPC(): NPC {
        return this.npc;
    }

    // ── 每帧调用（同步） ───────────────────────────────────────
    update(): void {
        const hour = this.timeManager.getHour();

        // 气泡跟随 NPC 移动
        this.thoughtBubble.update();

        switch (this.phase) {

            case 'off_duty':
                if (hour >= 10 && hour < 22) {
                    this.startShift();
                }
                break;

            case 'entering':
                if (this.isQueueDone()) {
                    console.log('👮 老刘进镇，开始工作');
                    this.phase = 'on_duty';
                    this.lastPatrolTime = 0;
                    this.showThought(this.enteringThoughts());
                } else {
                    this.advanceQueue();
                }
                break;

            case 'on_duty':
                if (hour >= 22 || hour < 10) {
                    this.endShift();
                    break;
                }
                if (this.isQueueDone()) {
                    const now = Date.now();
                    if (now - this.lastPatrolTime > this.PATROL_INTERVAL) {
                        this.pickNextPatrol();
                        this.lastPatrolTime = now;
                    }
                } else {
                    this.advanceQueue();
                }
                // 巡逻途中偶尔冒出随机独白
                this.maybeShowRandomThought();
                break;

            case 'going_home':
                if (this.isQueueDone()) {
                    console.log('🏠 老刘回家了');
                    this.npc.setVisible(false);
                    this.phase = 'off_duty';
                } else {
                    this.advanceQueue();
                }
                break;
        }
    }

    // ── 内心独白触发 ──────────────────────────────────────────

    private showThought(text: string, duration = 4000): void {
        this.thoughtBubble.show(text, duration);
    }

    /** 进入镇子时的想法 */
    private enteringThoughts(): string {
        const thoughts = [
            '又是巡逻的一天...',
            '二柱子别给我整幺蛾子',
            '张婶今天进货了没',
            '今儿天挺好',
        ];
        return thoughts[Math.floor(Math.random() * thoughts.length)];
    }

    /** 到达某个地点时的想法 */
    private arrivalThought(dest: { x: number; y: number }): string {
        const cx = WAYPOINTS.CAFE.x, cy = WAYPOINTS.CAFE.y;
        const sx = WAYPOINTS.STORE.x, sy = WAYPOINTS.STORE.y;
        const px = WAYPOINTS.PARK_NORTH.x, py = WAYPOINTS.PARK_NORTH.y;

        const near = (a: {x:number,y:number}, b: {x:number,y:number}) =>
            Math.abs(a.x - b.x) < 80 && Math.abs(a.y - b.y) < 80;

        if (near(dest, {x: cx, y: cy})) {
            return ['大强，整两句', '咖啡啥味儿来着', '这旮旯年轻人多'][Math.floor(Math.random() * 3)];
        }
        if (near(dest, {x: sx, y: sy})) {
            return ['张婶没事儿吧', '进啥货了今天', '门锁好了没'][Math.floor(Math.random() * 3)];
        }
        if (near(dest, {x: px, y: py})) {
            return ['王大爷棋赢了没', '公园还算太平', '大妈们还跳舞呢'][Math.floor(Math.random() * 3)];
        }
        return ['转一圈', '没啥动静，好', '辖区太平'][Math.floor(Math.random() * 3)];
    }

    /** 巡逻途中随机冒出的独白（低概率，避免刷屏） */
    private maybeShowRandomThought(): void {
        if (this.thoughtBubble.isShowing()) return;
        const now = Date.now();
        if (now - this.lastThoughtTime < this.THOUGHT_INTERVAL) return;
        if (Math.random() > 0.015) return; // 每帧 1.5% 概率，配合间隔控制频率

        const thoughts = [
            '媳妇今天卖了多少',
            '女儿最近咋样了',
            '二柱子别给我回来',
            '这条路走了二十年了',
            '快到饭点了...',
            '天有点凉了',
            '今儿没啥事儿挺好',
            '腿有点酸了',
        ];
        this.showThought(thoughts[Math.floor(Math.random() * thoughts.length)]);
        this.lastThoughtTime = now;
    }

    // ── 上班：从出生地走进镇子 ────────────────────────────────
    private startShift(): void {
        console.log('☀️ 老刘上班，从家出发');
        this.phase = 'entering';
        this.npc.setPosition(WAYPOINTS.SPAWN.x, WAYPOINTS.SPAWN.y);
        this.npc.setVisible(true);
        this.waypointQueue = [WAYPOINTS.TOWN_ENTRY, WAYPOINTS.CROSS_ROAD];
        this.advanceQueue();
    }

    // ── 下班：走回出生地消失 ──────────────────────────────────
    private endShift(): void {
        console.log('🌙 老刘下班，回家');
        this.phase = 'going_home';
        const cur = this.npc.getPosition();
        this.waypointQueue = buildPath(cur, WAYPOINTS.SPAWN);
        this.advanceQueue();
    }

    // ── 随机选下一个巡逻（工作）目标 ─────────────────────────
    private pickNextPatrol(): void {
        const dest =
            PATROL_DESTINATIONS[
                Math.floor(Math.random() * PATROL_DESTINATIONS.length)
            ];
        const cur = this.npc.getPosition();
        this.waypointQueue = buildPath(cur, dest);
        console.log(`🚶 老刘巡逻 → (${dest.x}, ${dest.y})`);
        // 出发时冒出目的地相关的想法
        this.showThought(this.arrivalThought(dest), 3500);
        this.advanceQueue();
    }

    // ── 路径队列：只有到达上一个点（IDLE）才取下一个 ─────────
    private advanceQueue(): void {
        if (this.waypointQueue.length === 0) return;
        if (this.npc.getState() !== NPCState.IDLE) return;
        const next = this.waypointQueue.shift()!;
        this.npc.setTarget(next.x, next.y);
    }

    private isQueueDone(): boolean {
        return (
            this.waypointQueue.length === 0 &&
            this.npc.getState() === NPCState.IDLE
        );
    }

    // ── AI 对话 ───────────────────────────────────────────────
    async handleConversation(playerMessage: string): Promise<string> {
        try {
            const systemPrompt = buildNPCPrompt(
`你是老刘（刘建国），48岁，哑巴镇白班社区民警，从警23年。现在正在镇上巡逻执勤。

【核心气质】
你是个在岗的民警，不是在家唠嗑的邻居。说话要让人感觉你随时在"管事儿"——眼睛盯着镇上动静，脑子想着辖区安全，顺带跟街坊搭句话。热心但有分寸，亲切但不散漫。

【说话规则——必须严格遵守】
1. 每次回复最多3句话，不超过50个字，一句一行。
2. 东北口语，多用：咋、整、嗯哪、贼、那旮旯、行了行了、咋整、没事儿。
3. 说话带"执勤感"：提到巡逻、查看、辖区、治安，偶尔冒出"情况属实""已掌握"，紧接大白话。
4. 对玩家叫"李家妹子"，像长辈但也像值班的人。
5. 遇到问题先问"咋回事儿"，再给建议。
6. 不废话，说完就完，不总结，不抒情。

【禁忌】不写长段，不写文章，不说镇子以外的地方。`
            );

            const response = await this.aiAssistant.handleConversation(
                systemPrompt,
                playerMessage
            );
            const result = response ?? this.getFallbackResponse(playerMessage);

            // 判断是否需要写入交接池
            this.maybeRecordHandoffNote(playerMessage, result);

            return result;
        } catch (error) {
            console.error('老刘对话失败:', error);
            return '得了，我这儿有点事儿。\n回头再唠！';
        }
    }

    /**
     * 对话后判断是否写入交接池
     * 只记录涉及"治安/人/事件"的信息，过滤日常寒暄
     */
    private maybeRecordHandoffNote(playerMsg: string, _npcReply: string): void {
        const keywords = ['陌生人', '可疑', '二柱子', '打架', '偷', '丢', '坏', '危险',
                          '出事', '有人', '发现', '看见', '怪', '问题', '帮', '报警'];
        const hit = keywords.find(k => playerMsg.includes(k));
        if (!hit) return;

        // 提取一句简短描述（取玩家原话前 20 字）
        const summary = playerMsg.length > 20
            ? playerMsg.slice(0, 20) + '...'
            : playerMsg;

        const hour = this.timeManager.getHour();
        ShiftHandoffPool.getInstance().addNote('李家妹子', summary, hour);
    }

    private getFallbackResponse(playerMessage: string): string {
        const responses = [
            '哎，李家妹子，咋地了？\n有啥事儿说啊。',
            '嗯哪，我在呢。\n整啥事儿了？',
            '咋了这是？\n说吧，我听着呢。',
            '行了行了，别墨迹了。\n有话直说。',
        ];
        if (playerMessage.includes('安全') || playerMessage.includes('治安'))
            return '治安？贼好！\n我天天转悠着呢，放心吧。';
        if (playerMessage.includes('帮助') || playerMessage.includes('问题'))
            return '咋整了？说！\n我老刘能办的，绝不含糊。';
        if (playerMessage.includes('工作'))
            return '干了23年了。\n累啥累，街坊都好好的就行。';
        if (playerMessage.includes('二柱子') || playerMessage.includes('二柱'))
            return '二柱子？！\n那小子又回来了？我去瞅瞅！';
        return responses[Math.floor(Math.random() * responses.length)];
    }

    /** 对话开始：暂停巡逻，隐藏气泡 */
    pausePatrol(): void {
        this.thoughtBubble.hide();
        this.npc.setTalking();
    }

    /** 对话结束：恢复巡逻 */
    resumePatrol(): void {
        this.npc.setIdle();
        this.lastPatrolTime = 0;
    }

    /** 对话结束后的反应气泡（由 MainScene 调用） */
    showPostConversationThought(topic: string): void {
        const thoughts: Record<string, string> = {
            '二柱子': '二柱子的事得上心...',
            '治安': '辖区没问题，放心',
            '安全': '这片我盯着呢',
            '女儿': '闺女挺好的...',
        };
        for (const [key, text] of Object.entries(thoughts)) {
            if (topic.includes(key)) {
                this.scene_delayThought(text, 800);
                return;
            }
        }
        this.scene_delayThought('行了，继续转', 800);
    }

    /** 延迟显示气泡（对话结束后停顿一下再冒泡） */
    private scene_delayThought(text: string, delayMs: number): void {
        this.npc.scene.time.delayedCall(delayMs, () => {
            this.showThought(text, 3500);
        });
    }

    getStatus() {
        return { name: '老刘', phase: this.phase, goal: '社区巡逻' };
    }

    getAIStats() {
        return this.aiAssistant.getUsageStats();
    }
}
