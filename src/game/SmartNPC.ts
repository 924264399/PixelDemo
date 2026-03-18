/**
 * 场景感知NPC系统 - 让NPC根据所在位置智能切换行为
 */

import { NPC, NPCState, SceneType, SceneBehavior } from './NPC';
import { PathPlanner, Waypoint } from './PathPlanner';

/**
 * 场景管理器 - 检测NPC当前所在场景并触发相应行为
 */
export class SceneManager {
    // 场景区域定义（基于地图坐标）
    private static readonly SCENE_ZONES: Map<SceneType, { 
        bounds: { x: number; y: number; width: number; height: number }, 
        behavior: SceneBehavior 
    }> = new Map([
        [SceneType.CAFE, {
            bounds: { x: 850, y: 400, width: 300, height: 450 }, // 咖啡馆区域
            behavior: {
                sceneType: SceneType.CAFE,
                states: [NPCState.WORKING, NPCState.SINGING, NPCState.TALKING],
                defaultState: NPCState.WORKING,
                activities: ['制作咖啡', '招呼客人', '唱歌娱乐', '清理桌子'],
                workPosition: { x: 911, y: 455 }, // 咖啡馆工位
                patrolPoints: [
                    { x: 911, y: 455 },   // 工作台
                    { x: 950, y: 500 },   // 服务区
                    { x: 880, y: 520 },   // 清洁区
                    { x: 920, y: 480 }    // 休息区
                ]
            }
        }],
        [SceneType.STORE, {
            bounds: { x: 1500, y: 800, width: 300, height: 150 }, // 便利店区域（调整坐标）
            behavior: {
                sceneType: SceneType.STORE,
                states: [NPCState.WORKING, NPCState.PATROL, NPCState.TALKING],
                defaultState: NPCState.WORKING,
                activities: ['整理货架', '收银服务', '库存检查', '店内巡视'],
                workPosition: { x: 1688, y: 620 }, // 便利店工位
                patrolPoints: [
                    { x: 1688, y: 620 },  // 收银台
                    { x: 1650, y: 650 },  // 货架A
                    { x: 1720, y: 680 },  // 货架B
                    { x: 1670, y: 600 }   // 入口处
                ]
            }
        }],
        [SceneType.PARK, {
            bounds: { x: 1100, y: 1100, width: 550, height: 550 }, // 公园区域
            behavior: {
                sceneType: SceneType.PARK,
                states: [NPCState.RELAXING, NPCState.SINGING, NPCState.DANCING],
                defaultState: NPCState.RELAXING,
                activities: ['在长椅上休息', '欣赏风景', '户外唱歌', '自由舞蹈'],
                patrolPoints: [
                    { x: 1481, y: 1601 }, // 公园核心
                    { x: 1350, y: 1400 }, // 休息区A
                    { x: 1550, y: 1500 }, // 休息区B
                    { x: 1200, y: 1550 }  // 活动区
                ]
            }
        }],
        [SceneType.ROAD, {
            bounds: { x: 0, y: 0, width: 2048, height: 2048 }, // 默认为道路（最大范围）
            behavior: {
                sceneType: SceneType.ROAD,
                states: [NPCState.MOVING, NPCState.IDLE],
                defaultState: NPCState.MOVING,
                activities: ['赶路中', '路上休息']
            }
        }]
    ]);

    /**
     * 检测NPC当前所在场景
     */
    static detectScene(position: { x: number; y: number }): SceneType {
        // 按优先级检测（小范围优先于大范围）
        const sceneOrder = [SceneType.CAFE, SceneType.STORE, SceneType.PARK, SceneType.ROAD];
        
        for (const sceneType of sceneOrder) {
            const zone = this.SCENE_ZONES.get(sceneType);
            if (zone && this.isInBounds(position, zone.bounds)) {
                return sceneType;
            }
        }
        
        return SceneType.ROAD; // 默认场景
    }

    /**
     * 获取场景行为配置
     */
    static getSceneBehavior(sceneType: SceneType): SceneBehavior | null {
        const zone = this.SCENE_ZONES.get(sceneType);
        return zone ? zone.behavior : null;
    }

    /**
     * 检查位置是否在边界内
     */
    private static isInBounds(position: { x: number; y: number }, bounds: { x: number; y: number; width: number; height: number }): boolean {
        return position.x >= bounds.x && 
               position.x <= bounds.x + bounds.width &&
               position.y >= bounds.y && 
               position.y <= bounds.y + bounds.height;
    }
}

/**
 * 智能NPC - 具备场景感知能力
 */
export class SmartNPC extends NPC {
    private currentScene: SceneType = SceneType.ROAD;
    private sceneBehavior: SceneBehavior | null = null;
    private activityIndex = 0;
    private lastSceneCheck = 0;
    private speechBubble: NPCSpeechBubble | null = null;
    
    // 场景特定计时器
    private sceneTimer = 0;
    private nextActivityTime = 0;

    constructor(scene: Phaser.Scene, config: any) {
        super(scene, config);
        this.createSpeechBubble();
        console.log(`✨ 智能NPC "${config.name}" 创建完成，位置: (${config.startX}, ${config.startY})`);
        
        // 初始场景检测
        setTimeout(() => {
            console.log('🎯 初始场景检测');
            this.checkAndUpdateScene();
        }, 2000);
    }

    /**
     * 创建语音气泡
     */
    private createSpeechBubble(): void {
        this.speechBubble = new NPCSpeechBubble(this.scene, this);
    }

    /**
     * 扩展的更新方法 - 加入场景感知
     */
    update() {
        // 调用父类的移动逻辑
        super.update();

        // 更新语音气泡位置
        if (this.speechBubble) {
            this.speechBubble.update();
        }

        // 场景检测（仅用于气泡显示，不影响行为）
        const now = Date.now();
        if (now - this.lastSceneCheck > 5000) { // 每5秒检查一次，降低频率
            this.checkAndUpdateScene();
            this.lastSceneCheck = now;
        }
    }

    /**
     * 检查并更新场景
     */
    private checkAndUpdateScene(): void {
        const position = this.getPosition();
        const newScene = SceneManager.detectScene(position);

        // 调试输出 - 显示当前位置和检测到的场景
        if (Math.floor(this.x) !== Math.floor(position.x) || Math.floor(this.y) !== Math.floor(position.y)) {
            console.log(`📍 ${this.getName()} 位置: (${Math.floor(this.x)}, ${Math.floor(this.y)}) -> 场景: ${newScene}`);
        }

        if (newScene !== this.currentScene) {
            this.onSceneChanged(this.currentScene, newScene);
            this.currentScene = newScene;
            this.sceneBehavior = SceneManager.getSceneBehavior(newScene);
            this.sceneTimer = 0;
            this.nextActivityTime = 0;
        }
    }

    /**
     * 场景切换事件处理
     */
    private onSceneChanged(oldScene: SceneType, newScene: SceneType): void {
        console.log(`🎬 ${this.getName()} 从 ${oldScene} 进入 ${newScene}，位置: (${this.x}, ${this.y})`);
        
        // 获取新场景的行为配置
        this.sceneBehavior = SceneManager.getSceneBehavior(newScene);
        
        // 显示场景切换气泡（但不强制切换状态）
        this.showSceneBubble(newScene);
        
        // 暂时不自动切换状态，让NPC继续原来的巡逻
        // 未来这里可以由AI Agent决策
        console.log(`📍 场景切换完成，继续当前行为`);
    }

    /**
     * 更新场景特定行为
     */
    private updateSceneBehavior(): void {
        if (!this.sceneBehavior || this.getState() === NPCState.MOVING) {
            return;
        }

        this.sceneTimer++;
        
        // 每5秒切换一次活动
        if (this.sceneTimer > this.nextActivityTime) {
            this.performSceneActivity();
            this.nextActivityTime = this.sceneTimer + 300; // 5秒后下一个活动
        }
    }

    /**
     * 执行场景特定活动
     */
    private performSceneActivity(): void {
        if (!this.sceneBehavior) return;

        // 选择一个可用状态
        const availableStates = this.sceneBehavior.states.filter(state => 
            state !== NPCState.MOVING && state !== this.getState()
        );

        if (availableStates.length > 0) {
            const newState = availableStates[Math.floor(Math.random() * availableStates.length)];
            this.setState(newState);

            // 显示活动气泡
            const activity = this.getRandomActivity();
            this.showActivityBubble(newState, activity);

            // 执行特定行为
            this.executeStateAction(newState);
        }
    }

    /**
     * 执行状态特定动作
     */
    private executeStateAction(state: NPCState): void {
        switch (state) {
            case NPCState.WORKING:
                if (this.sceneBehavior?.workPosition) {
                    this.setTarget(this.sceneBehavior.workPosition.x, this.sceneBehavior.workPosition.y);
                }
                break;
                
            case NPCState.PATROL:
                if (this.sceneBehavior?.patrolPoints && this.sceneBehavior.patrolPoints.length > 0) {
                    const point = this.sceneBehavior.patrolPoints[this.activityIndex % this.sceneBehavior.patrolPoints.length];
                    this.setTarget(point.x, point.y);
                    this.activityIndex++;
                }
                break;
                
            case NPCState.SINGING:
            case NPCState.DANCING:
            case NPCState.RELAXING:
                // 这些状态保持在当前位置，未来可以加入动画
                this.stop();
                break;
        }
    }

    /**
     * 获取随机活动描述
     */
    private getRandomActivity(): string {
        if (!this.sceneBehavior?.activities) return '待机中';
        const activities = this.sceneBehavior.activities;
        return activities[Math.floor(Math.random() * activities.length)];
    }

    /**
     * 显示场景切换气泡
     */
    private showSceneBubble(scene: SceneType): void {
        const sceneNames = {
            [SceneType.CAFE]: '咖啡馆',
            [SceneType.STORE]: '便利店', 
            [SceneType.PARK]: '公园',
            [SceneType.ROAD]: '路上',
            [SceneType.HOME]: '家'
        };
        
        const message = `我在${sceneNames[scene]}`;
        this.speechBubble?.show(message, 3000); // 显示3秒
    }

    /**
     * 显示活动气泡
     */
    private showActivityBubble(state: NPCState, activity: string): void {
        const stateEmojis = {
            [NPCState.WORKING]: '💼',
            [NPCState.SINGING]: '🎵',
            [NPCState.DANCING]: '💃',
            [NPCState.RELAXING]: '😌',
            [NPCState.PATROL]: '👀',
            [NPCState.TALKING]: '💬',
            [NPCState.IDLE]: '😐',
            [NPCState.MOVING]: '🚶'
        };

        const emoji = stateEmojis[state] || '';
        const message = `${emoji} ${activity}`;
        this.speechBubble?.show(message, 2000); // 显示2秒
    }

    /**
     * 设置NPC状态
     */
    setState(state: NPCState): void {
        if (state === NPCState.IDLE) {
            this.setIdle();
        } else if (state === NPCState.TALKING) {
            this.setTalking();
        } else {
            // 设置其他自定义状态
            this.stop();
            (this as any).currentState = state;
        }
    }

    /**
     * 获取当前场景
     */
    getCurrentScene(): SceneType {
        return this.currentScene;
    }

    /**
     * 清理资源
     */
    destroy(): void {
        if (this.speechBubble) {
            this.speechBubble.destroy();
        }
        super.destroy();
    }
}

/**
 * NPC语音气泡组件
 */
class NPCSpeechBubble {
    private scene: Phaser.Scene;
    private npc: NPC;
    private bubble: Phaser.GameObjects.Group | null = null;
    private text: Phaser.GameObjects.Text | null = null;
    private background: Phaser.GameObjects.Graphics | null = null;
    private hideTimer: Phaser.Time.TimerEvent | null = null;

    constructor(scene: Phaser.Scene, npc: NPC) {
        this.scene = scene;
        this.npc = npc;
    }

    /**
     * 显示气泡消息
     */
    show(message: string, duration: number = 2000): void {
        console.log(`💬 显示气泡: "${message}", 持续${duration}ms`);
        
        this.hide(); // 先隐藏之前的气泡

        // 创建文本（先创建文本以获取尺寸）
        this.text = this.scene.add.text(0, 0, message, {
            fontSize: '14px',
            color: '#000000',
            align: 'center',
            padding: { x: 8, y: 4 }
        });

        // 计算气泡尺寸
        const textBounds = this.text.getBounds();
        const bubbleWidth = textBounds.width + 16;
        const bubbleHeight = textBounds.height + 8;

        // 创建背景
        this.background = this.scene.add.graphics();
        this.background.fillStyle(0xFFFFFF, 0.9); // 调低透明度，从1.0改为0.9
        this.background.lineStyle(2, 0x000000, 0.8); // 边框也稍微透明一点

        // 绘制气泡背景
        this.background.fillRoundedRect(0, 0, bubbleWidth, bubbleHeight, 8);
        this.background.strokeRoundedRect(0, 0, bubbleWidth, bubbleHeight, 8);

        // 绘制小三角形（指向NPC）
        this.background.fillTriangle(
            bubbleWidth / 2 - 5, bubbleHeight,
            bubbleWidth / 2 + 5, bubbleHeight,
            bubbleWidth / 2, bubbleHeight + 8
        );
        this.background.strokeTriangle(
            bubbleWidth / 2 - 5, bubbleHeight,
            bubbleWidth / 2 + 5, bubbleHeight,
            bubbleWidth / 2, bubbleHeight + 8
        );

        // 文本位置稍后在updatePosition中设置

        // 设置渲染深度（确保在最上层）
        this.background.setDepth(2000);
        this.text.setDepth(2001);

        // 立即更新位置
        this.updatePosition();

        // 设置自动隐藏定时器
        this.hideTimer = this.scene.time.delayedCall(duration, () => {
            console.log(`💬 气泡定时隐藏: "${message}"`);
            this.hide();
        });

        console.log(`💬 气泡创建完成，位置: (${this.background.x}, ${this.background.y})`);
    }

    /**
     * 更新气泡位置
     */
    update(): void {
        if (this.background && this.text) {
            this.updatePosition();
        }
    }

    /**
     * 更新气泡位置到NPC头顶
     */
    private updatePosition(): void {
        if (!this.background || !this.text) {
            console.log('💬 警告: 气泡组件不存在，停止更新位置');
            return;
        }

        // 计算气泡的宽度用于居中
        const textBounds = this.text.getBounds();
        const bubbleWidth = textBounds.width + 16;
        
        // 获取NPC的世界坐标，气泡居中显示在NPC头顶
        const x = this.npc.x - bubbleWidth / 2; // 居中显示
        const y = this.npc.y - 60; // NPC头顶上方60像素

        // 调试输出位置更新
        if (Math.abs(this.background.x - x) > 5 || Math.abs(this.background.y - y) > 5) {
            console.log(`💬 更新气泡位置: NPC(${Math.floor(this.npc.x)}, ${Math.floor(this.npc.y)}) -> 气泡(${Math.floor(x)}, ${Math.floor(y)})`);
        }

        this.background.setPosition(x, y);
        this.text.setPosition(x + 8, y + 4);
    }

    /**
     * 隐藏气泡
     */
    hide(): void {
        console.log('💬 隐藏气泡');
        
        if (this.hideTimer) {
            this.hideTimer.destroy();
            this.hideTimer = null;
        }

        if (this.background) {
            this.background.destroy();
            this.background = null;
        }

        if (this.text) {
            this.text.destroy();
            this.text = null;
        }

        if (this.bubble) {
            this.bubble.destroy();
            this.bubble = null;
        }
    }

    /**
     * 销毁气泡
     */
    destroy(): void {
        this.hide();
    }
}