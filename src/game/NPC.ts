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
}

// NPC寻路目标
export interface Vector2 {
    x: number;
    y: number;
}

import Phaser from 'phaser';

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

    // 道路网络坐标（基于地图坐标文档）
    private readonly CROSS_ROAD_X = 1019; // 十字路口X坐标
    private readonly CROSS_ROAD_Y = 1022; // 十字路口Y坐标

    constructor(scene: Phaser.Scene, config: NPCConfig) {
        super(scene, config.startX, config.startY, config.texture);
        this.npcId = config.id;
        this.npcName = config.name;
        this.moveSpeed = config.speed;

        // 添加到场景和物理系统
        scene.add.existing(this);
        scene.physics.add.existing(this);

        // 物理属性
        this.body?.setSize(32, 32);
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
    stop() {
        this.targetPosition = null;
        this.currentState = NPCState.IDLE;
        this.body?.setVelocity(0, 0);
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
        this.stop();
        this.currentState = NPCState.TALKING;
    }

    /**
     * 设置为空闲状态
     */
    setIdle() {
        this.currentState = NPCState.IDLE;
    }

    update() {
        if (this.currentState !== NPCState.MOVING || !this.targetPosition) {
            return;
        }

        const dx = this.targetPosition.x - this.x;
        const dy = this.targetPosition.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // 到达目标（阈值20像素，避免因目标在障碍物边缘导致反复抽搐）
        if (distance < 20) {
            this.stop();
            return;
        }

        // 计算归一化方向向量
        const dirX = dx / distance;
        const dirY = dy / distance;

        // 智能避障系统
        const avoidanceResult = this.smartAvoidance(dirX, dirY);
        
        if (avoidanceResult.canMove) {
            // 设置移动速度
            const speed = 120;
            this.body?.setVelocity(avoidanceResult.dirX * speed, avoidanceResult.dirY * speed);
        } else {
            // 临时停止，等待障碍清除或寻找新路径
            this.body?.setVelocity(0, 0);
            this.handleStuckState();
        }
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
        
        // 如果卡住超过2秒（约120帧），强制重新规划
        if (this.stuckCounter > 120) {
            console.log(`NPC ${this.npcName} 卡住，强制重新规划路径`);
            this.stuckCounter = 0;
            this.avoidanceDirection = null; // 清除避障状态
            this.avoidanceFrames = 0;
            
            // 尝试回退到安全位置
            this.forceEscape();
        }
    }
    
    /**
     * 强制脱困 - 回退到安全位置
     * 如果 8 个方向全被堵死，放弃当前目标回到 IDLE，由上层逻辑重新选路
     */
    private forceEscape(): void {
        const escapeDirections = [
            { x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 },
            { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 }
        ];

        for (const dir of escapeDirections) {
            const escapeX = this.x + dir.x * 20;
            const escapeY = this.y + dir.y * 20;

            if (!this.checkCollision(escapeX, escapeY)) {
                console.log(`NPC ${this.npcName} 脱困到: (${escapeX}, ${escapeY})`);
                this.setPosition(escapeX, escapeY);
                return;
            }
        }

        // 8 个方向全堵死 → 放弃目标，回到 IDLE，让上层巡逻逻辑重新选路
        console.warn(`NPC ${this.npcName} 完全卡死，放弃目标回到 IDLE`);
        this.stop(); // targetPosition = null，state = IDLE
    }

    /**
     * 优化的碰撞检测
     */
    private checkCollision(x: number, y: number): boolean {
        return this.collisionChecker ? this.collisionChecker(x, y) : false;
    }

}