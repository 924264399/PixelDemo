/**
 * 夜班警察 NPC —— 老王（王大春）
 * 47岁，夜班社区民警，从警22年
 */

import { NPC, NPCConfig, NPCState } from '../game/NPC';
import { NPCAIAssistant, AIServiceManager } from '../utils/AIService';
import { buildNPCPrompt } from './townContext';
import { TimeManager } from '../game/TimeManager';
import { ThoughtBubble } from '../game/ThoughtBubble';
import { ShiftHandoffPool } from './ShiftHandoffPool';

// 老王关键路径节点（从镇东方向入镇）
const WANG_WAYPOINTS = {
    SPAWN:      { x: 2000, y: 1022 }, // 地图外出生地（镇东）
    TOWN_ENTRY: { x: 1700, y: 1022 }, // 镇入口（主路东端）
    CROSS_ROAD: { x: 1019, y: 1022 }, // 十字路口
    PARK_CORE:  { x: 1481, y: 1601 }, // 公园核心
    PARK_NORTH: { x: 1601, y: 1103 }, // 公园入口北
    STORE:      { x: 1601, y: 845  }, // 便利店
    CAFE:       { x: 992,  y: 820  }, // 咖啡馆
};

const WANG_PATROL_DESTINATIONS = [
    WANG_WAYPOINTS.CROSS_ROAD,
    WANG_WAYPOINTS.PARK_CORE,
    WANG_WAYPOINTS.PARK_NORTH,
    WANG_WAYPOINTS.STORE,
    WANG_WAYPOINTS.CAFE,
];

function wangJitter(p: {x:number,y:number}, range = 10): {x:number,y:number} {
    return {
        x: p.x + Math.round((Math.random() - 0.5) * range * 2),
        y: p.y + Math.round((Math.random() - 0.5) * range * 2),
    };
}

function buildWangPath(
    from: {x:number,y:number},
    to: {x:number,y:number}
): {x:number,y:number}[] {
    const mid: {x:number,y:number}[] = [];
    if (from.x > 1750) mid.push(wangJitter(WANG_WAYPOINTS.TOWN_ENTRY, 8));
    const onMainRoad = (p:{x:number,y:number}) => Math.abs(p.y - WANG_WAYPOINTS.CROSS_ROAD.y) < 200;
    if (!onMainRoad(from) || !onMainRoad(to)) mid.push(wangJitter(WANG_WAYPOINTS.CROSS_ROAD, 10));
    return [...mid, wangJitter(to, 10)];
}

type WangPhase = 'off_duty' | 'entering' | 'on_duty' | 'going_home';

export class NightPoliceNPC {
    private npc: NPC;
    private aiAssistant: NPCAIAssistant;
    private timeManager: TimeManager;

    private phase: WangPhase = 'off_duty';
    private waypointQueue: {x:number,y:number}[] = [];
    private lastPatrolTime = 0;
    private readonly PATROL_INTERVAL = 10000;

    private thoughtBubble!: ThoughtBubble;
    private handoffDone = false;        // 今天是否已完成交接
    private handoffPromptCache = '';    // 从老刘那里接收的信息，缓存到本地

    constructor(scene: Phaser.Scene, timeManager: TimeManager) {
        try {
            console.log('🌙 创建夜班警察NPC 老王...');

            const npcConfig: NPCConfig = {
                id: 'officer_wang_night',
                name: '老王',
                startX: WANG_WAYPOINTS.SPAWN.x,
                startY: WANG_WAYPOINTS.SPAWN.y,
                speed: 70,
                texture: 'npc_police2'
            };

            this.npc = new NPC(scene, npcConfig);
            this.timeManager = timeManager;

            const aiManager = AIServiceManager.getInstance();
            this.aiAssistant = aiManager.createAssistant('officer_wang_night');

            this.thoughtBubble = new ThoughtBubble(scene, this.npc);

            // 未上班前隐藏
            this.npc.setVisible(false);
            console.log('✅ 老王待命，等待22点上班');
        } catch (error) {
            console.error('❌ 老王创建失败:', error);
            throw error;
        }
    }

    getNPC(): NPC {
        return this.npc;
    }

    update(): void {
        const hour = this.timeManager.getHour();
        this.thoughtBubble.update();

        switch (this.phase) {
            case 'off_duty':
                // 22:00 或 00:00-10:00 上班
                if (hour >= 22 || hour < 10) {
                    this.startShift();
                }
                break;

            case 'entering':
                if (this.isQueueDone()) {
                    this.phase = 'on_duty';
                    this.lastPatrolTime = 0;
                    this.thoughtBubble.show('夜里不消停...', 3500);
                    // 入镇后接收交接信息
                    this.receiveHandoff();
                } else {
                    this.advanceQueue();
                }
                break;

            case 'on_duty':
                // 10:00 下班
                if (hour >= 10 && hour < 22) {
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
                break;

            case 'going_home':
                if (this.isQueueDone()) {
                    this.npc.setVisible(false);
                    this.phase = 'off_duty';
                    this.handoffDone = false; // 重置交接状态供明天使用
                } else {
                    this.advanceQueue();
                }
                break;
        }
    }

    private startShift(): void {
        this.phase = 'entering';
        this.npc.setPosition(WANG_WAYPOINTS.SPAWN.x, WANG_WAYPOINTS.SPAWN.y);
        this.npc.setVisible(true);
        this.waypointQueue = [WANG_WAYPOINTS.TOWN_ENTRY, WANG_WAYPOINTS.CROSS_ROAD];
        this.advanceQueue();
        console.log('🌙 老王出发，夜班开始');
    }

    private endShift(): void {
        this.phase = 'going_home';
        const cur = this.npc.getPosition();
        this.waypointQueue = buildWangPath(cur, WANG_WAYPOINTS.SPAWN);
        this.advanceQueue();
        console.log('🌅 老王收班，回家');
    }

    private pickNextPatrol(): void {
        const dest = WANG_PATROL_DESTINATIONS[
            Math.floor(Math.random() * WANG_PATROL_DESTINATIONS.length)
        ];
        const cur = this.npc.getPosition();
        this.waypointQueue = buildWangPath(cur, dest);
        this.advanceQueue();
    }

    private advanceQueue(): void {
        if (this.waypointQueue.length === 0) return;
        if (this.npc.getState() !== NPCState.IDLE) return;
        const next = this.waypointQueue.shift()!;
        this.npc.setTarget(next.x, next.y);
    }

    private isQueueDone(): boolean {
        return this.waypointQueue.length === 0 && this.npc.getState() === NPCState.IDLE;
    }

    /**
     * 接收老刘的交接信息，注入到 systemPrompt 里
     * 同时显示"交接中"气泡，清空消息池
     */
    private receiveHandoff(): void {
        const pool = ShiftHandoffPool.getInstance();
        if (!pool.hasNotes() || this.handoffDone) return;

        this.handoffDone = true;

        // ✅ 先把信息缓存到本地，再清空 Pool
        //    这样 handleConversation() 后续读 handoffPromptCache 才能拿到数据
        this.handoffPromptCache = pool.toPromptString();
        console.log('🤝 老王收到交接信息:', pool.getNotes());
        pool.clear();

        this.thoughtBubble.show('🔄 收到交接...', 3000);
    }

    async handleConversation(playerMessage: string): Promise<string> {
        try {
            // ✅ 使用本地缓存的交接信息（而非每次重新读已清空的 Pool）
            const handoffContext = this.handoffPromptCache;

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

【禁忌】不写长段，不抒情，不废话，不说镇子以外的地方。` + handoffContext
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