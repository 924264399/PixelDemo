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
import { PathPlanner } from '../game/PathPlanner';

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

// 工作状态下的随机巡逻目标（公园统一用 PARK_CORE，门禁约束自动插入大门）
const PATROL_DESTINATIONS = [
    WAYPOINTS.CROSS_ROAD,
    WAYPOINTS.CAFE,
    WAYPOINTS.STORE,
    WAYPOINTS.PARK_CORE,  // PathPlanner 会自动先过 park_north 大门
];

/** 给路径节点加随机抖动 */
function jitter(p: { x: number; y: number }, range = 10): { x: number; y: number } {
    return {
        x: p.x + Math.round((Math.random() - 0.5) * range * 2),
        y: p.y + Math.round((Math.random() - 0.5) * range * 2),
    };
}

/**
 * 使用 PathPlanner 规划老刘路径，享有门禁约束（公园必过大门）
 * 入镇时（from.x < 650）额外插入 TOWN_ENTRY 中继点
 */
function buildPath(
    from: { x: number; y: number },
    to: { x: number; y: number },
    npcId = 'officer_liu'
): { x: number; y: number }[] {
    const segments: { x: number; y: number }[][] = [];

    let planFrom = from;
    if (from.x < 650) {
        // 还在镇外，先手动插入入口点
        segments.push([jitter(WAYPOINTS.TOWN_ENTRY, 8)]);
        planFrom = WAYPOINTS.TOWN_ENTRY;
    }

    // PathPlanner 规划（含门禁约束）
    const planned = PathPlanner.planPath({
        from: planFrom,
        to,
        npcId,
        randomization: 0.2,
    });

    // planPath 第一个点是 from 本身，跳过避免重复
    const routePoints = planned.slice(1).map(wp => ({ x: wp.x, y: wp.y }));
    segments.push(routePoints);

    return segments.flat();
}

// ── 地点关键词映射 ─────────────────────────────────────────────
const LOCATION_KEYWORDS: { keywords: string[]; dest: { x: number; y: number }; label: string }[] = [
    { keywords: ['公园', '游乐', '广场'], dest: WAYPOINTS.PARK_CORE,  label: '公园' },
    { keywords: ['便利店', '超市', '张婶', '商店'], dest: WAYPOINTS.STORE, label: '便利店' },
    { keywords: ['咖啡', '咖啡馆', '大强'], dest: WAYPOINTS.CAFE,  label: '咖啡馆' },
    { keywords: ['路口', '十字', '中间'], dest: WAYPOINTS.CROSS_ROAD, label: '路口' },
];

/** 从玩家消息里识别地点，返回 { dest, label } 或 null */
function extractLocation(msg: string): { dest: { x: number; y: number }; label: string } | null {
    for (const entry of LOCATION_KEYWORDS) {
        if (entry.keywords.some(k => msg.includes(k))) {
            return { dest: entry.dest, label: entry.label };
        }
    }
    return null;
}

// ── 工作状态机 ────────────────────────────────────────────────
type PatrolPhase = 'off_duty' | 'entering' | 'on_duty' | 'investigating' | 'going_home';

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
    private readonly THOUGHT_INTERVAL = 18000;

    // ── 出警子状态 ──────────────────────────────────────────────
    private investigateTarget: { x: number; y: number } | null = null;
    private investigateLabel = '';
    private investigateStartTime = 0;
    private readonly INVESTIGATE_TIMEOUT = 60_000;

    // 对话期间记录的待出警地点，对话结束后在 resumePatrol 里触发
    private pendingDispatch: { dest: { x: number; y: number }; label: string } | null = null;

    // 对话进行中标志：update() 暂停状态机，防止 phase 被意外推进
    private isTalking = false;

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
        // 对话期间暂停状态机，防止 entering/on_duty 被意外推进
        if (this.isTalking) {
            this.thoughtBubble.update();
            return;
        }

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
                this.maybeShowRandomThought();
                break;

            case 'investigating':
                // 下班时间到了，直接打断出警，回家
                if (hour >= 22 || hour < 10) {
                    this.endShift();
                    break;
                }
                if (this.isQueueDone()) {
                    // 到达目标地点，停留等待超时后回到正常巡逻
                    if (Date.now() - this.investigateStartTime > this.INVESTIGATE_TIMEOUT) {
                        console.log('👮 老刘出警结束，恢复正常巡逻');
                        this.showThought('没发现啥，继续转', 3000);
                        this.phase = 'on_duty';
                        this.lastPatrolTime = 0;
                    }
                } else {
                    this.advanceQueue();
                }
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

    /**
     * 生成 LLM 开场白（基于历史上下文）
     * 传入特殊触发词 [GREETING]，NPC 根据之前对话历史决定说什么
     */
    async generateGreeting(): Promise<string> {
        const history = this.aiAssistant.getHistory();
        const hasHistory = history.length > 0;

        const trigger = hasHistory
            ? '[GREETING] 玩家又来找你说话了。你们之前聊过，你记得那些对话。根据你们的关系和上次聊的内容，自然地开口打个招呼，可以提及上次聊的事，也可以说说你现在在干嘛。不要说"上次"这两个字，自然融入即可。只输出你说的话，不超过2句，不超过30字。'
            : '[GREETING] 玩家第一次来找你说话。作为正在巡逻的民警，自然地开口。只输出你说的话，不超过2句，不超过30字。';

        try {
            const systemPrompt = buildNPCPrompt(
`你是老刘（刘建国），48岁，哑巴镇白班社区民警，从警23年。东北口语，说话简短有执勤感。`
            );
            const response = await this.aiAssistant.handleConversation(systemPrompt, trigger);
            // 开场白不计入正式对话历史（避免污染上下文）
            // 但 handleConversation 已经把它加进去了，所以手动移除最后两条
            const hist = this.aiAssistant.getHistory();
            // 移除刚才的 [GREETING] 触发 + 回复，保持历史干净
            (this.aiAssistant as any).conversationHistory = hist.slice(0, -2);
            return response ?? this.getFallbackGreeting(hasHistory);
        } catch {
            return this.getFallbackGreeting(hasHistory);
        }
    }

    private getFallbackGreeting(hasHistory: boolean): string {
        if (hasHistory) {
            const opts = ['又来了，有事儿？', '咋了，有情况？', '说吧，听着呢。'];
            return opts[Math.floor(Math.random() * opts.length)];
        }
        const opts = ['哎，李家妹子，咋了？', '正巡逻呢，有事儿说。', '咋了这是？'];
        return opts[Math.floor(Math.random() * opts.length)];
    }

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

            // 写入交接池
            this.maybeRecordHandoffNote(playerMessage, result);

            // 识别地点 → 记录出警目标（对话结束后 resumePatrol 会真正触发）
            const location = extractLocation(playerMessage);
            if (location && (this.phase === 'on_duty' || this.phase === 'investigating')) {
                this.pendingDispatch = location;
            }

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

    /**
     * 出警：打断当前巡逻，立刻前往指定地点查看
     * 只在 on_duty 状态下有效（entering/going_home 不响应）
     */
    dispatchTo(dest: { x: number; y: number }, label: string): void {
        console.log(`🚨 [dispatchTo] 当前phase=${this.phase}, 目标=${label}`);
        if (this.phase !== 'on_duty' && this.phase !== 'investigating') {
            console.warn(`⚠️ 老刘无法出警，当前状态: ${this.phase}`);
            return;
        }
        console.log(`🚨 老刘出警 → ${label} (${dest.x}, ${dest.y})`);
        this.phase = 'investigating';
        this.investigateTarget = dest;
        this.investigateLabel = label;
        this.investigateStartTime = Date.now();

        // 清空当前路径，重新规划
        this.waypointQueue = [];
        const cur = this.npc.getPosition();
        this.waypointQueue = buildPath(cur, dest);
        this.npc.setIdle(); // 打断当前移动
        this.advanceQueue();

        // 出发后 3 秒冒第一条 LLM 独白，之后每 18 秒一条
        this.scheduleInvestigateThought(3000);
    }

    /**
     * 出警途中循环生成 LLM 内心独白
     * 每次显示完后，如果还在 investigating 状态，再隔一段时间生成下一条
     */
    private scheduleInvestigateThought(delayMs: number): void {
        this.npc.scene.time.delayedCall(delayMs, async () => {
            if (this.phase !== 'investigating') return; // 已结束出警，停止
            await this.generateAndShowThought();
            // 显示 4 秒后继续下一条（共享上下文，自然演变）
            this.scheduleInvestigateThought(18000);
        });
    }

    /**
     * 调用 LLM 生成一句内心独白并显示在气泡里
     * 用 [THOUGHT] 标签避免污染对话历史（不走 handleConversation）
     */
    private async generateAndShowThought(): Promise<void> {
        try {
            const label = this.investigateLabel || '目标地点';
            const prompt = `[THOUGHT] 你是老刘，正在赶往${label}处理情况。根据你刚才和李家妹子的对话，用第一人称说一句内心独白。要求：不超过12个字，东北口语，不要标点符号之外的任何格式。只输出那句话本身。`;
            const thought = await this.aiAssistant.handleConversation('__system__', prompt);
            if (thought && this.phase === 'investigating') {
                // 清理可能的引号和多余空白
                const clean = thought.replace(/^["「『]|["」』]$/g, '').trim();
                this.showThought(clean, 4000);
            }
        } catch {
            // LLM 失败时 fallback 到硬编码
            this.showThought(`那小偷跑哪旮旯了`, 3000);
        }
    }

    /** 对话开始：暂停状态机 + 停止移动 */
    pausePatrol(): void {
        this.isTalking = true;      // ← 冻结 update() 状态机
        this.thoughtBubble.hide();
        this.npc.setTalking();
    }

    /** 对话结束：恢复状态机，按需出警 */
    resumePatrol(): void {
        this.npc.setIdle();
        if (this.pendingDispatch) {
            const { dest, label } = this.pendingDispatch;
            this.pendingDispatch = null;
            // 先把所有状态设好，再解冻 update()
            this.phase = 'on_duty';
            this.waypointQueue = [];
            // 直接内联出警逻辑，不走 dispatchTo() 避免 phase 检查干扰
            console.log(`🚨 [resumePatrol] 出警 → ${label}`);
            this.phase = 'investigating';
            this.investigateTarget = dest;
            this.investigateLabel = label;
            this.investigateStartTime = Date.now();
            this.waypointQueue = buildPath(this.npc.getPosition(), dest);
            this.advanceQueue();
            this.showThought(`去${label}瞅瞅！`, 3500);
        } else {
            this.lastPatrolTime = 0;
        }
        this.isTalking = false;     // ← 最后才解冻，所有状态已就绪
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
