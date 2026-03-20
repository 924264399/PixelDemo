// NPC状态
export enum NPCState {
    IDLE = 'idle',
    MOVING = 'moving',
    TALKING = 'talking',
    WORKING = 'working',
    SINGING = 'singing',
    DANCING = 'dancing',
    RELAXING = 'relaxing',
    PATROL = 'patrol'
}

// 场景类型
export enum SceneType {
    CAFE = 'cafe',
    STORE = 'store',
    PARK = 'park',
    ROAD = 'road',
    HOME = 'home'
}

// 场景行为配置
export interface SceneBehavior {
    sceneType: SceneType;
    states: NPCState[];
    defaultState: NPCState;
    activities: string[];
    workPosition?: { x: number; y: number };
    patrolPoints?: { x: number; y: number }[];
}

// NPC移动配置
export interface NPCConfig {
    id: string;
    name: string;
    startX: number;
    startY: number;
    speed: number;
    texture: string;
    framesPerAnim?: number; // 每方向帧数，默认 8
}

// NPC寻路目标
export interface Vector2 {
    x: number;
    y: number;
}

import Phaser from 'phaser';
import { registerLPCAnims, playLPCAnim, velocityToDirection, getIdleFrame, LPCDirection } from './LPCSprite';

/**
 * NPC角色类 - 预留AI Agent接口
 *
 * AI Agent通过以下接口控制NPC:
 * - setTarget(x, y): 设置目标位置，NPC自动寻路前往
 * - stop(): 停止移动
 * - getPosition(): 获取当前位置
 * - getState(): 获取当前状态
 */
export class NPC extends Phaser.Physics.Arcade.Sprite {
    private targetPosition: Vector2 | null = null;
    private currentState: NPCState = NPCState.IDLE;
    private moveSpeed: number;
    private npcId: string;
    private npcName: string;

    // 碰撞检测回调（由Scene注入）
    private collisionChecker: ((x: number, y: number) => boolean) | null = null;

    // 动画相关
    private framesPerAnim: number;
    private currentDir: LPCDirection = 'down';

    // 道路网络坐标（基于地图坐标文档）
    private readonly CROSS_ROAD_X = 1019; // 十字路口X坐标
    private readonly CROSS_ROAD_Y = 1022; // 十字路口Y坐标

    // 调试
    private debugGraphics: Phaser.GameObjects.Graphics | null = null;
    private debugLabel: Phaser.GameObjects.Text | null = null;
    static debugEnabled = false; // 由 MainScene F2 切换

    // 进度追踪（防卡死）
    private lastDistToTarget = Infinity;
    private noProgressFrames = 0;
    private readonly NO_PROGRESS_LIMIT = 90; // 1.5秒无进度 → 脱困

    constructor(scene: Phaser.Scene, config: NPCConfig) {
        super(scene, config.startX, config.startY, config.texture);
        this.npcId   = config.id;
        this.npcName = config.name;
        this.moveSpeed     = config.speed;
        this.framesPerAnim = config.framesPerAnim ?? 8;

        // 添加到场景和物理系统
        scene.add.existing(this);
        scene.physics.add.existing(this);

        // 物理属性
        this.body?.setSize(32, 32);

        // 注册 LPC 行走动画
        registerLPCAnims(scene, config.texture, ['walk'], this.framesPerAnim);
        // 设置初始静止帧（朝下）
        this.setFrame(getIdleFrame('down', this.framesPerAnim));
        this.setScale(1.5);

        // 调试图层
        this.debugGraphics = scene.add.graphics().setDepth(999);
        this.debugLabel = scene.add.text(0, 0, '', {
            fontSize: '10px', color: '#00ff00',
            backgroundColor: '#000000aa', padding: { x: 2, y: 1 },
        }).setDepth(1000).setVisible(false);
    }

    /**
     * 设置碰撞检测函数（由Scene在创建时注入）
     */
    setCollisionChecker(checker: (x: number, y: number) => boolean) {
        this.collisionChecker = checker;
    }

    /**
     * 设置目标位置，NPC自动寻路前往（使用智能路径规划）
     * AI Agent调用此方法让NPC移动到指定位置
     */
    setTarget(x: number, y: number) {
        this.targetPosition = { x, y };
        this.currentState = NPCState.MOVING;
        this.stuckCounter = 0; // 重置卡住计数器
        this.avoidanceDirection = null;
        this.avoidanceFrames = 0;
    }

    /**
     * 停止移动
     * AI Agent调用此方法停止NPC
     */
    stopMoving() {
        this.targetPosition = null;
        this.currentState = NPCState.IDLE;
        (this.body as Phaser.Physics.Arcade.Body)?.setVelocity(0, 0);
    }

    /**
     * 获取当前位置
     */
    getPosition(): Vector2 {
        return { x: this.x, y: this.y };
    }

    /**
     * 获取当前状态
     */
    getState(): NPCState {
        return this.currentState;
    }

    /**
     * 获取NPC ID
     */
    getId(): string {
        return this.npcId;
    }

    /**
     * 获取NPC名称
     */
    getName(): string {
        return this.npcName;
    }

    /**
     * 设置为对话状态
     */
    setTalking() {
        this.stopMoving();
        this.currentState = NPCState.TALKING;
    }

    /**
     * 设置为空闲状态
     */
    setIdle() {
        this.currentState = NPCState.IDLE;
    }

    update() {
        this.drawDebug();

        if (this.currentState !== NPCState.MOVING || !this.targetPosition) {
            // 停止时播放静止帧
            this.anims.stop();
            this.setFrame(getIdleFrame(this.currentDir, this.framesPerAnim));
            return;
        }

        const dx = this.targetPosition.x - this.x;
        const dy = this.targetPosition.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // 到达目标（阈值20像素，避免因目标在障碍物边缘导致反复抽搐）
        if (distance < 20) {
            this.noProgressFrames = 0;
            this.lastDistToTarget = Infinity;
            this.stopMoving();
            return;
        }

        // ── 距离进度检测（每帧比较距离，持续无进展则脱困）──
        if (distance < this.lastDistToTarget - 2) {
            // 正在靠近目标，重置计数
            this.lastDistToTarget = distance;
            this.noProgressFrames = 0;
        } else {
            this.noProgressFrames++;
            if (this.noProgressFrames >= this.NO_PROGRESS_LIMIT) {
                console.warn(`[NPC:${this.npcName}] ${this.NO_PROGRESS_LIMIT}帧无进展(dist=${Math.round(distance)})，触发脱困`);
                this.noProgressFrames = 0;
                this.lastDistToTarget = Infinity;
                this.avoidanceDirection = null;
                this.avoidanceFrames = 0;
                this.forceEscape();
                return;
            }
        }

        // 计算归一化方向向量
        const dirX = dx / distance;
        const dirY = dy / distance;

        // 智能避障系统
        const avoidanceResult = this.smartAvoidance(dirX, dirY);
        
        if (avoidanceResult.canMove) {
            const speed = 120;
            const CORNER_STEPS = [4, 8, 12];
            let vx = avoidanceResult.dirX * speed;
            let vy = avoidanceResult.dirY * speed;

            // 转角滑动修正：单轴被挡时自动微调另一轴
            const hits = (nx: number, ny: number) => this.countCollisions(nx, ny);

            // X 方向被挡，尝试 Y 微调
            if (avoidanceResult.dirX !== 0 && avoidanceResult.dirY === 0) {
                const nextX = this.x + avoidanceResult.dirX * 2;
                if (hits(nextX, this.y) > 0) {
                    let slid = false;
                    for (const step of CORNER_STEPS) {
                        if (hits(nextX, this.y - step) === 0) { vy = -speed; slid = true; break; }
                        if (hits(nextX, this.y + step) === 0) { vy =  speed; slid = true; break; }
                    }
                    if (!slid) vx = 0;
                }
            }
            // Y 方向被挡，尝试 X 微调
            if (avoidanceResult.dirY !== 0 && avoidanceResult.dirX === 0) {
                const nextY = this.y + avoidanceResult.dirY * 2;
                if (hits(this.x, nextY) > 0) {
                    let slid = false;
                    for (const step of CORNER_STEPS) {
                        if (hits(this.x - step, nextY) === 0) { vx = -speed; slid = true; break; }
                        if (hits(this.x + step, nextY) === 0) { vx =  speed; slid = true; break; }
                    }
                    if (!slid) vy = 0;
                }
            }

            (this.body as Phaser.Physics.Arcade.Body)?.setVelocity(vx, vy);
            // 播放行走动画
            this.currentDir = velocityToDirection(vx, vy);
            playLPCAnim(this as unknown as Phaser.GameObjects.Sprite, this.texture.key, 'walk', this.currentDir);
        } else {
            // 临时停止，等待障碍清除或寻找新路径
            (this.body as Phaser.Physics.Arcade.Body)?.setVelocity(0, 0);
            this.anims.stop();
            this.setFrame(getIdleFrame(this.currentDir, this.framesPerAnim));
            this.handleStuckState();
        }
    }

    /** 调试绘制：碰撞框 + 状态 + 目标连线 */
    private drawDebug(): void {
        const g = this.debugGraphics;
        const t = this.debugLabel;
        if (!g || !t) return;
        g.clear();
        t.setVisible(NPC.debugEnabled);
        if (!NPC.debugEnabled) return;

        const HW = 10, HH = 6, FO = 16;
        const fx = this.x, fy = this.y + FO;

        // 碰撞框（绿=可通行，红=嵌入）
        const hits = this.countCollisions(this.x, this.y);
        g.lineStyle(1, hits > 0 ? 0xff0000 : 0x00ff00, 1);
        g.strokeRect(fx - HW, fy - HH, HW * 2, HH * 2);

        // 目标连线
        if (this.targetPosition) {
            g.lineStyle(1, 0xffff00, 0.6);
            g.lineBetween(this.x, this.y, this.targetPosition.x, this.targetPosition.y);
            g.fillStyle(0xffff00, 1);
            g.fillCircle(this.targetPosition.x, this.targetPosition.y, 4);
        }

        // 状态标签
        const cam = this.scene.cameras.main;
        const sx = (this.x - cam.worldView.x) * cam.zoom;
        const sy = (this.y - 40 - cam.worldView.y) * cam.zoom;
        t.setPosition(sx - 30, sy);
        t.setText([
            `${this.npcName} ${this.currentState}`,
            `嵌入:${hits}/4  卡:${this.stuckCounter}`,
        ].join('\n'));
    }

    /**
     * 智能避障算法 - 防抽搐版本
     */
    private avoidanceDirection: { x: number; y: number } | null = null;
    private avoidanceFrames = 0;
    
    private smartAvoidance(targetDirX: number, targetDirY: number): 
        { canMove: boolean; dirX: number; dirY: number } {
        
        const moveDistance = 4; // 增加预测距离
        const originalX = this.x + targetDirX * moveDistance;
        const originalY = this.y + targetDirY * moveDistance;

        // 1. 尝试原路径
        if (!this.checkCollision(originalX, originalY)) {
            // 清除避障状态
            this.avoidanceDirection = null;
            this.avoidanceFrames = 0;
            return { canMove: true, dirX: targetDirX, dirY: targetDirY };
        }

        // 2. 如果正在避障，继续当前避障方向一段时间
        if (this.avoidanceDirection && this.avoidanceFrames < 60) { // 1秒避障时间
            const testX = this.x + this.avoidanceDirection.x * moveDistance;
            const testY = this.y + this.avoidanceDirection.y * moveDistance;
            
            if (!this.checkCollision(testX, testY)) {
                this.avoidanceFrames++;
                return { 
                    canMove: true, 
                    dirX: this.avoidanceDirection.x, 
                    dirY: this.avoidanceDirection.y 
                };
            }
        }

        // 3. 寻找新的避障方向
        const avoidanceDirections = [
            // 优先尝试沿主轴移动
            { x: Math.sign(targetDirX), y: 0, priority: 1 },         
            { x: 0, y: Math.sign(targetDirY), priority: 1 },         
            
            // 然后尝试大角度绕行
            { x: -Math.sign(targetDirY), y: Math.sign(targetDirX), priority: 2 }, // 逆时针90度
            { x: Math.sign(targetDirY), y: -Math.sign(targetDirX), priority: 2 }, // 顺时针90度
            
            // 最后尝试后退
            { x: -Math.sign(targetDirX), y: 0, priority: 3 },
            { x: 0, y: -Math.sign(targetDirY), priority: 3 },
        ];

        // 按优先级排序并测试
        avoidanceDirections.sort((a, b) => a.priority - b.priority);
        
        for (const dir of avoidanceDirections) {
            if (dir.x === 0 && dir.y === 0) continue;
            
            const magnitude = Math.sqrt(dir.x * dir.x + dir.y * dir.y);
            const normalizedX = dir.x / magnitude;
            const normalizedY = dir.y / magnitude;
            const testX = this.x + normalizedX * moveDistance;
            const testY = this.y + normalizedY * moveDistance;

            if (!this.checkCollision(testX, testY)) {
                // 设置新的避障方向并锁定一段时间
                this.avoidanceDirection = { x: normalizedX, y: normalizedY };
                this.avoidanceFrames = 0;
                return { canMove: true, dirX: normalizedX, dirY: normalizedY };
            }
        }

        return { canMove: false, dirX: 0, dirY: 0 };
    }

    /**
     * 处理卡住状态 - 改进版
     */
    private stuckCounter = 0;
    private lastPosition: { x: number; y: number } | null = null;
    
    private handleStuckState(): void {
        // 检查是否真的卡住（位置没有明显变化）
        const currentPos = { x: Math.floor(this.x), y: Math.floor(this.y) };
        
        if (this.lastPosition && 
            Math.abs(currentPos.x - this.lastPosition.x) < 2 && 
            Math.abs(currentPos.y - this.lastPosition.y) < 2) {
            this.stuckCounter++;
        } else {
            this.stuckCounter = 0; // 重置计数器，NPC在移动
        }
        
        this.lastPosition = currentPos;
        
        // 卡住超过 1 秒（60帧）→ 脱困
        if (this.stuckCounter > 60) {
            console.warn(`[NPC:${this.npcName}] 卡住 ${this.stuckCounter} 帧，尝试脱困`);
            this.stuckCounter = 0;
            this.avoidanceDirection = null;
            this.avoidanceFrames = 0;
            this.forceEscape();
        }
    }
    
    /**
     * 强制脱困 - 逐步扩大搜索半径，最终传送到十字路口
     */
    private forceEscape(): void {
        const dirs = [
            { x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 },
            { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 },
        ];

        // 逐步扩大搜索半径：20 → 40 → 60 → 100px
        for (const radius of [20, 40, 60, 100]) {
            for (const dir of dirs) {
                const ex = this.x + dir.x * radius;
                const ey = this.y + dir.y * radius;
                if (this.countCollisions(ex, ey) === 0) {
                    console.log(`[NPC:${this.npcName}] 脱困 r=${radius} → (${Math.round(ex)}, ${Math.round(ey)})`);
                    this.setPosition(ex, ey);
                    return;
                }
            }
        }

        // 终极方案：直接传送到十字路口（已知安全区域）
        console.warn(`[NPC:${this.npcName}] 完全卡死，传送到十字路口`);
        this.setPosition(this.CROSS_ROAD_X, this.CROSS_ROAD_Y);
    }

    /**
     * 单点碰撞采样
     */
    private checkCollision(x: number, y: number): boolean {
        return this.collisionChecker ? this.collisionChecker(x, y) : false;
    }

    /**
     * 多点包围盒碰撞计数（0~4），用于转角滑动修正。
     * NPC 碰撞框：halfW=10, halfH=6, footOffset=16
     */
    private countCollisions(
        x: number, y: number,
        halfW = 10, halfH = 6, footOffset = 16
    ): number {
        const fy = y + footOffset;
        return (
            (this.checkCollision(x - halfW, fy - halfH) ? 1 : 0) +
            (this.checkCollision(x + halfW, fy - halfH) ? 1 : 0) +
            (this.checkCollision(x - halfW, fy + halfH) ? 1 : 0) +
            (this.checkCollision(x + halfW, fy + halfH) ? 1 : 0)
        );
    }

}