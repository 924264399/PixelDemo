import Phaser from 'phaser';
import { NPC, NPCConfig, NPCState } from './NPC';
import { PathPlanner, Waypoint } from './PathPlanner';
import { CafeWorkerAgent, NPCPersonality } from './AIAgent';
// import { SmartNPC, SceneManager } from './SmartNPC'; // 已停用：咖啡店员旧系统
import { TimeManager } from './TimeManager';
import { PoliceNPCIntegration } from '../agents/PoliceNPCIntegration';
import { NightPoliceNPC } from '../agents/NightPoliceNPC';

export class MainScene extends Phaser.Scene {
    private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    private npc!: NPC; // 保留字段兼容旧代码引用，不再使用 SmartNPC
    private policeSystem!: PoliceNPCIntegration; // 白班警察老刘
    private nightPolice!: NightPoliceNPC;         // 夜班警察老王
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private background!: Phaser.GameObjects.TileSprite;

    // 对话系统
    private dialogContainer!: Phaser.GameObjects.Container;
    private dialogBox!: Phaser.GameObjects.Graphics;
    private dialogText!: Phaser.GameObjects.Text;
    private dialogInputBox!: Phaser.GameObjects.Graphics;
    private dialogInput!: Phaser.GameObjects.Text;
    private escHintText!: Phaser.GameObjects.Text;
    private promptText!: Phaser.GameObjects.Text;
    
    // 时间系统
    private timeManager!: TimeManager;
    private isInDialogMode = false;
    private currentInputText = '';
    private isNearNPC = false;
    private eKey!: Phaser.Input.Keyboard.Key;
    private enterKey!: Phaser.Input.Keyboard.Key;
    private hiddenInput!: HTMLInputElement;
    private chatHistory: string[] = []; // 完整聊天记录（不截断）
    private chatScrollOffset = 0;        // 按「视觉行」偏移，0=最新
    private chatWrapWidth = 520;         // wordWrap宽度（像素），初始化后更新
    private readonly CHAT_FONT_SIZE = 14;
    private readonly CHAT_LINE_HEIGHT = 20;
    private readonly CHAT_VISIBLE_LINES = 9;
    // 用于像素级文字测量的离屏 Canvas
    private _measureCtx: CanvasRenderingContext2D | null = null;

    // 遮罩相关
    private collisionMaskCanvas!: HTMLCanvasElement;
    private collisionMaskContext!: CanvasRenderingContext2D;
    private indoorOutdoorMaskCanvas!: HTMLCanvasElement;
    private indoorOutdoorMaskContext!: CanvasRenderingContext2D;

    // 遮罩数据
    private collisionMaskImageData!: ImageData;
    private indoorOutdoorMaskImageData!: ImageData;
    private maskWidth = 512; // 遮罩图尺寸，可根据实际图片调整
    private maskHeight = 512;
    private worldToMaskRatio = 4; // 2048/512 = 4

    // 屋顶系统 - 使用像素检测方案（你的建议）
    private roofSprites: Map<string, Phaser.GameObjects.TileSprite> = new Map();
    private roofCanvases: Map<string, {canvas: HTMLCanvasElement, context: CanvasRenderingContext2D}> = new Map();
    private roofAlphaSpeed = 0.05; // 渐变速度，约3-4帧完成过渡
    private currentRoofAlphas: Map<string, number> = new Map();
    private targetRoofAlphas: Map<string, number> = new Map();

    // 定义世界尺寸
    private readonly WORLD_WIDTH = 2048;
    private readonly WORLD_HEIGHT = 2048;

    constructor() {
        super('MainScene');
    }

    preload() {
        // 加载背景图、玩家角色、屋顶图和遮罩图
        this.load.image('background', 'assets/scene.png');
        this.load.image('player', 'assets/sprites/player.png');
        this.load.image('roof_home', 'assets/roof_home.png');
        this.load.image('roof_store', 'assets/roof_store.png');
        this.load.image('roof_cafe', 'assets/roof_cafe.png');
        this.load.image('collision_mask', 'assets/collision_mask.png');
        this.load.image('indoor_outdoor_mask', 'assets/indoor_outdoor_mask.png');
        this.load.image('npc_police1', 'assets/sprites/npc_police1.png');
        this.load.image('npc_police2', 'assets/sprites/npc_police2.png');
    }

    create() {
        // 获取浏览器窗口尺寸
        const width = window.innerWidth;
        const height = window.innerHeight;

        // 设置世界边界为2048x2048
        this.physics.world.setBounds(0, 0, this.WORLD_WIDTH, this.WORLD_HEIGHT);

        // 添加背景作为TileSprite以适应更大的世界
        this.background = this.add.tileSprite(0, 0, this.WORLD_WIDTH, this.WORLD_HEIGHT, 'background');
        this.background.setOrigin(0, 0);

        // 创建玩家角色（起始位置：世界中心 1024, 1024）
        this.player = this.physics.add.sprite(1024, 1024, 'player');

        // 设置玩家物理属性
        this.player.setCollideWorldBounds(true);
        this.player.setBounce(0.2);
        this.player.setDrag(500);

        // 设置键盘输入
        this.cursors = this.input.keyboard.createCursorKeys();

        // 启用相机跟随玩家
        this.cameras.main.startFollow(this.player, true, 0.1, 0.1);
        this.cameras.main.setBounds(0, 0, this.WORLD_WIDTH, this.WORLD_HEIGHT);

        // 初始化遮罩图（离屏canvas）
        this.initMasks();

        // 创建NPC（用于测试寻路系统）
        this.createNPC();

        // 创建建筑屋顶（基于2048x2048完整屋顶图）- 放在NPC之后以确保屋顶在上层
        this.createBuildingRoofs();

        // 初始化对话系统
        this.initDialogSystem();
        
        // 初始化时间系统
        this.timeManager = new TimeManager(this);

        // 设置键盘事件
        this.eKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
        this.enterKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER);
        
        // 🚀 初始化警察NPC系统
        try {
            this.initPoliceSystem();
        } catch (error) {
            console.error('警察系统初始化失败，但游戏继续运行:', error);
        }

        try {
            this.nightPolice = new NightPoliceNPC(this, this.timeManager);
            this.nightPolice.getNPC().setCollisionChecker((x, y) => this.checkCollisionAt(x, y));
        } catch (error) {
            console.error('老王初始化失败，但游戏继续运行:', error);
        }
    }

    private createNPC() {
        const npcConfig: NPCConfig = {
            id: 'npc_1',
            name: '咖啡店员',
            startX: 992,  // 咖啡馆门口
            startY: 820,
            speed: 80,
                texture: 'npc_police1'
        };

        // 创建智能NPC（具备场景感知能力）
        // ── SmartNPC 咖啡店员已停用，由独立 NPC Agent 系统替代 ──
        // this.npc = new SmartNPC(this, npcConfig);
        // this.npc.setCollisionChecker((x, y) => this.checkCollisionAt(x, y));
        // this.setupNPCTask();
    }

    private setupNPCTask() {
        // 基于地图坐标文档的正确巡逻路线
        // 十字路口: (1019, 1022)，咖啡馆: (992, 820)，便利店: (1601, 845)，公园入口: (1601, 1103)
        const patrolRoutes = [
            {
                name: '咖啡馆门口',
                path: [{ x: 992, y: 820 }],
                waitTime: 2000 // 在咖啡馆停留2秒
            },
            {
                name: '前往便利店',
                path: [
                    { x: 1019, y: 820 },   // 先到咖啡馆同Y轴的主路位置
                    { x: 1019, y: 1022 },  // 到十字路口
                    { x: 1601, y: 1022 },  // 沿主路到便利店X轴
                    { x: 1601, y: 845 }    // 到便利店门口
                ]
            },
            {
                name: '便利店门口',
                path: [{ x: 1601, y: 845 }],
                waitTime: 2000 // 在便利店停留2秒
            },
            {
                name: '前往公园',
                path: [
                    { x: 1601, y: 1022 },  // 先回到主路
                    { x: 1601, y: 1103 }   // 到公园入口
                ]
            },
            {
                name: '公园游览',
                path: [
                    { x: 1601, y: 1103 },  // 公园入口（北）
                    { x: 1550, y: 1200 },  // 公园内漫步点1
                    { x: 1481, y: 1300 },  // 接近公园核心
                    { x: 1481, y: 1601 },  // 公园核心
                    { x: 1400, y: 1550 },  // 公园内漫步点2
                    { x: 1350, y: 1610 },  // 接近南入口
                    { x: 1142, y: 1610 },  // 公园入口（南）
                    { x: 1200, y: 1500 },  // 公园内漫步点3
                    { x: 1300, y: 1400 },  // 公园内漫步点4
                    { x: 1481, y: 1450 },  // 再次经过核心区域
                    { x: 1601, y: 1300 },  // 准备离开
                    { x: 1601, y: 1103 }   // 回到北入口
                ],
                waitTime: 1000 // 每个点停留1秒
            },
            {
                name: '返回咖啡馆',
                path: [
                    { x: 1601, y: 1022 },  // 回到主路
                    { x: 1019, y: 1022 },  // 到十字路口
                    { x: 1019, y: 820 },   // 到咖啡馆Y轴
                    { x: 992, y: 820 }     // 回到咖啡馆门口
                ]
            }
        ];

        let currentRouteIndex = 0;
        let currentPathIndex = 0;
        let waitStartTime = 0;

        // 启动巡逻循环
        this.time.addEvent({
            delay: 500, // 每0.5秒检查一次，更流畅
            loop: true,
            callback: () => {
                if (this.npc.getState() === NPCState.IDLE) {
                    const currentRoute = patrolRoutes[currentRouteIndex];
                    const path = currentRoute.path;
                    const waitTime = currentRoute.waitTime || 0;

                    // 如果有等待时间且是第一次到达这个路线
                    if (waitTime > 0 && currentPathIndex === 0 && waitStartTime === 0) {
                        waitStartTime = this.time.now;
                        return;
                    }

                    // 检查等待时间是否结束
                    if (waitStartTime > 0) {
                        if (this.time.now - waitStartTime < waitTime) {
                            return; // 继续等待
                        } else {
                            waitStartTime = 0; // 等待结束
                        }
                    }

                    if (currentPathIndex < path.length) {
                        // 移动到当前路径点
                        const target = path[currentPathIndex];
                        this.npc.setTarget(target.x, target.y);
                        console.log(`NPC前往 ${currentRoute.name} 路径点 ${currentPathIndex + 1}/${path.length}: (${target.x}, ${target.y})`);
                        currentPathIndex++;
                    } else {
                        // 完成当前路线，切换到下一条
                        currentRouteIndex = (currentRouteIndex + 1) % patrolRoutes.length;
                        currentPathIndex = 0;
                        waitStartTime = 0;
                        console.log(`NPC完成路线: ${currentRoute.name}，切换到: ${patrolRoutes[currentRouteIndex].name}`);
                    }
                }
            }
        });
    }
    
    /**
     * � 增强调试的警察NPC系统初始化
     */
    private async initPoliceSystem(): Promise<void> {
        try {
            console.log('🏛️ 开始初始化警察NPC系统...');
            
            // 创建警察NPC集成系统
            this.policeSystem = new PoliceNPCIntegration(this, this.timeManager);
            console.log('📦 PoliceNPCIntegration 创建完成');
            
            const success = await this.policeSystem.initialize();
            console.log(`🔍 初始化结果: ${success ? '成功' : '失败'}`);
            
            if (success) {
                console.log('✅ 警察NPC系统初始化成功！');
                
                // 设置警察NPC的碰撞检测
                const policeNPC = this.policeSystem.getPoliceNPC();
                console.log('🔍 获取到的警察NPC:', policeNPC ? '存在' : '不存在');
                
                if (policeNPC && typeof policeNPC.setCollisionChecker === 'function') {
                    policeNPC.setCollisionChecker((x, y) => this.checkCollisionAt(x, y));
                    console.log('✅ 碰撞检测设置完成');
                }
                
                // 显示系统状态
                const status = this.policeSystem.getPoliceStatus();
                if (status) {
                    console.log(`👮‍♂️ ${status.name}已上岗:`, status);
                } else {
                    console.warn('⚠️  无法获取警察状态');
                }
                
            } else {
                console.warn('⚠️  警察NPC系统初始化失败，但不影响游戏运行');
            }
        } catch (error) {
            console.error('❌ 警察NPC系统初始化出错:', error);
            console.error('详细错误:', error.stack);
        }
    }
    
    /**
     * 🚀 处理与警察对话 - 返回回复内容而不是直接显示
     */
    private async handlePoliceDialog(playerMessage: string): Promise<string> {
        if (!this.policeSystem) {
            return '警察NPC系统未初始化';
        }

        try {
            const response = await this.policeSystem.handlePlayerDialog(playerMessage);
            console.log(`👮‍♂️ 老刘回复: ${response}`);
            return response;
        } catch (error) {
            console.error('对话处理失败:', error);
            return '抱歉，我现在有点忙，稍后再聊。';
        }
    }

    private initMasks() {
        // 创建碰撞遮罩canvas
        this.collisionMaskCanvas = document.createElement('canvas');
        this.collisionMaskCanvas.width = this.maskWidth;
        this.collisionMaskCanvas.height = this.maskHeight;
        this.collisionMaskContext = this.collisionMaskCanvas.getContext('2d')!;

        // 创建室内外遮罩canvas
        this.indoorOutdoorMaskCanvas = document.createElement('canvas');
        this.indoorOutdoorMaskCanvas.width = this.maskWidth;
        this.indoorOutdoorMaskCanvas.height = this.maskHeight;
        this.indoorOutdoorMaskContext = this.indoorOutdoorMaskCanvas.getContext('2d')!;

        // 获取遮罩纹理并绘制到canvas
        const collisionMaskTexture = this.textures.get('collision_mask');
        const indoorOutdoorMaskTexture = this.textures.get('indoor_outdoor_mask');

        if (collisionMaskTexture) {
            const collisionMaskImage = collisionMaskTexture.getSourceImage();
            this.collisionMaskContext.drawImage(collisionMaskImage, 0, 0, this.maskWidth, this.maskHeight);
            this.collisionMaskImageData = this.collisionMaskContext.getImageData(0, 0, this.maskWidth, this.maskHeight);
        }

        if (indoorOutdoorMaskTexture) {
            const indoorOutdoorMaskImage = indoorOutdoorMaskTexture.getSourceImage();
            this.indoorOutdoorMaskContext.drawImage(indoorOutdoorMaskImage, 0, 0, this.maskWidth, this.maskHeight);
            this.indoorOutdoorMaskImageData = this.indoorOutdoorMaskContext.getImageData(0, 0, this.maskWidth, this.maskHeight);
        }

        // 监听窗口大小变化
        window.addEventListener('resize', () => {
            const newWidth = window.innerWidth;
            const newHeight = window.innerHeight;

            // 更新相机大小
            this.cameras.main.setSize(newWidth, newHeight);
        });
    }

    private createBuildingRoofs() {
        // 创建3个完整的2048x2048屋顶图层
        const roofKeys = ['roof_home', 'roof_cafe', 'roof_store'];

        roofKeys.forEach(key => {
            const roofSprite = this.add.tileSprite(0, 0, this.WORLD_WIDTH, this.WORLD_HEIGHT, key);
            roofSprite.setOrigin(0, 0);
            roofSprite.setAlpha(1.0);
            this.roofSprites.set(key, roofSprite);
            this.currentRoofAlphas.set(key, 1.0);
            this.targetRoofAlphas.set(key, 1.0);
        });

        // 初始化屋顶Canvas用于像素检测
        this.initRoofCanvases();
    }

    private initRoofCanvases() {
        const roofKeys = ['roof_home', 'roof_cafe', 'roof_store'];

        roofKeys.forEach(key => {
            const texture = this.textures.get(key);
            if (texture) {
                const img = texture.getSourceImage();
                if (img) {
                    const canvas = document.createElement('canvas');
                    canvas.width = this.WORLD_WIDTH;
                    canvas.height = this.WORLD_HEIGHT;
                    const ctx = canvas.getContext('2d')!;
                    ctx.drawImage(img, 0, 0);
                    this.roofCanvases.set(key, {canvas, context: ctx});
                }
            }
        });
    }

    update() {
        // 处理键盘输入并检查碰撞
        let velocityX = 0;
        let velocityY = 0;

        if (this.cursors.left.isDown) {
            velocityX = -160;
        } else if (this.cursors.right.isDown) {
            velocityX = 160;
        }

        if (this.cursors.up.isDown) {
            velocityY = -160;
        } else if (this.cursors.down.isDown) {
            velocityY = 160;
        }

        // 检查X方向移动是否会发生碰撞
        if (velocityX !== 0) {
            const nextX = this.player.x + velocityX * 0.016; // 假设60fps
            if (!this.checkCollisionAt(nextX, this.player.y)) {
                this.player.setVelocityX(velocityX);
            } else {
                this.player.setVelocityX(0);
            }
        } else {
            this.player.setVelocityX(0);
        }

        // 检查Y方向移动是否会发生碰撞
        if (velocityY !== 0) {
            const nextY = this.player.y + velocityY * 0.016;
            if (!this.checkCollisionAt(this.player.x, nextY)) {
                this.player.setVelocityY(velocityY);
            } else {
                this.player.setVelocityY(0);
            }
        } else {
            this.player.setVelocityY(0);
        }

        // 更新咖啡店员物理移动
        // this.npc.update(); // SmartNPC 已停用

        // 更新老刘：状态机 + 物理移动
        try {
            if (this.policeSystem) {
                this.policeSystem.update();
                this.policeSystem.getPoliceNPC()?.update(); // ← 物理移动帧
            }
        } catch (error) {
            // 静默处理，不影响主循环
        }

        // 更新老王：状态机 + 物理移动
        try {
            if (this.nightPolice) {
                this.nightPolice.update();
                this.nightPolice.getNPC().update(); // ← 物理移动帧
            }
        } catch (error) {
            // 静默处理
        }

        // 使用像素检测方案更新屋顶透明度
        this.updateRoofTransparencyByPixelDetection();

        // 更新动态图层排序
        this.updateDepthSorting();

        // 更新对话系统
        this.updateDialogSystem();
        
        // 更新时间系统
        this.timeManager.update();
    }

    private checkCollisionAt(x: number, y: number): boolean {
        if (!this.collisionMaskImageData) {
            return false;
        }

        // 转换世界坐标到遮罩坐标
        const maskX = Math.floor(x / this.worldToMaskRatio);
        const maskY = Math.floor(y / this.worldToMaskRatio);

        // 确保坐标在遮罩范围内
        if (maskX < 0 || maskX >= this.maskWidth || maskY < 0 || maskY >= this.maskHeight) {
            return false;
        }

        const pixelIndex = (maskY * this.maskWidth + maskX) * 4;
        const r = this.collisionMaskImageData.data[pixelIndex];
        const g = this.collisionMaskImageData.data[pixelIndex + 1];
        const b = this.collisionMaskImageData.data[pixelIndex + 2];

        // 白色表示碰撞体
        // 阈值设为 630（单通道均值约 210），过滤掉 0.98 灰度等抗锯齿像素
        // 只有接近纯白（255,255,255）的像素才判定为碰撞
        return (r + g + b) > 630;
    }

    private hasRoofPixelAt(x: number, y: number, roofKey: string): boolean {
        // 确保坐标在有效范围内
        if (x < 0 || x >= this.WORLD_WIDTH || y < 0 || y >= this.WORLD_HEIGHT) {
            return false;
        }

        const roofData = this.roofCanvases.get(roofKey);
        if (!roofData) return false;

        // 获取单个像素的RGBA数据
        try {
            const pixelData = roofData.context.getImageData(x, y, 1, 1).data;
            const r = pixelData[0];
            const g = pixelData[1];
            const b = pixelData[2];
            const alpha = pixelData[3];

            // 检查是否有实际像素（RGB总和 > 0 或 alpha > 0）
            return (r + g + b) > 0 || alpha > 0;
        } catch (e) {
            console.warn('Failed to get pixel data at', x, y, roofKey);
            return false;
        }
    }

    private updateRoofTransparencyByPixelDetection() {
        // 获取玩家和NPC当前位置（整数坐标）
        const playerX = Math.floor(this.player.x);
        const playerY = Math.floor(this.player.y);
        // SmartNPC 已停用，屋顶透明度只看玩家位置
        const roofKeys = ['roof_home', 'roof_cafe', 'roof_store'];

        roofKeys.forEach(key => {
            const playerUnderRoof = this.hasRoofPixelAt(playerX, playerY, key);
            const npcUnderRoof = false; // SmartNPC 已停用

            let targetAlpha = 1.0;
            if (playerUnderRoof) {
                targetAlpha = 0.0;
            } else if (npcUnderRoof) {
                targetAlpha = 0.3; // NPC在屋内，半透明以便观察
            }
            
            this.targetRoofAlphas.set(key, targetAlpha);
        });

        // 统一进行平滑过渡
        roofKeys.forEach(key => {
            const current = this.currentRoofAlphas.get(key) ?? 1.0;
            const target = this.targetRoofAlphas.get(key) ?? 1.0;
            const roofSprite = this.roofSprites.get(key);

            if (!roofSprite) return;

            if (Math.abs(current - target) > 0.01) {
                // 进行插值计算
                const newAlpha = current + (target - current) * this.roofAlphaSpeed;
                this.currentRoofAlphas.set(key, newAlpha);
                roofSprite.setAlpha(newAlpha);
            } else {
                // 精确收敛到目标值
                this.currentRoofAlphas.set(key, target);
                roofSprite.setAlpha(target);
            }
        });
    }

    /**
     * � 恢复被意外删除的深度排序方法
     */
    private updateDepthSorting(): void {
        // 获取玩家和NPC的Y坐标
        const playerY = this.player.y;
        // 基础深度值
        const basePlayerDepth = 100;
        const baseNPCDepth = 100;

        // 玩家深度
        this.player.setDepth(basePlayerDepth + Math.floor(playerY));

        // 处理老刘的深度排序
        if (this.policeSystem) {
            const policeNPC = this.policeSystem.getPoliceNPC();
            if (policeNPC) {
                policeNPC.setDepth(baseNPCDepth + Math.floor(policeNPC.y));
            }
        }

        // 处理老王的深度排序
        if (this.nightPolice) {
            const wangNPC = this.nightPolice.getNPC();
            if (wangNPC) {
                wangNPC.setDepth(baseNPCDepth + Math.floor(wangNPC.y));
            }
        }
    }

    /**
     * 初始化对话系统
     */
    private initDialogSystem(): void {
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        // 对话框尺寸调整：恢复合理尺寸
        const dialogWidth = Math.min(600, screenWidth - 100); // 适中的宽度
        const dialogHeight = 320; // 适中的高度，足够显示对话
        const dialogX = screenWidth / 2 - dialogWidth / 2; // 居中显示
        const dialogY = screenHeight - dialogHeight - 50; // 底部留50px边距

        // 创建对话容器（保留以防后续使用，但不实际使用）
        this.dialogContainer = this.add.container(0, 0);
        this.dialogContainer.setScrollFactor(0); // 固定在屏幕上
        this.dialogContainer.setDepth(5000); // 最高深度
        this.dialogContainer.setVisible(false);

        // 创建木头风格对话框背景
        this.dialogBox = this.add.graphics();
        
        // 木头色调：深棕色背景
        this.dialogBox.fillStyle(0x8B4513, 0.95); // 深棕色
        
        // 绘制主背景
        this.dialogBox.fillRoundedRect(dialogX, dialogY, dialogWidth, dialogHeight, 8);
        
        // 顶部装饰条（浅棕色）
        this.dialogBox.fillStyle(0xA0522D, 0.9); // 浅棕色
        this.dialogBox.fillRoundedRect(dialogX + 4, dialogY + 4, dialogWidth - 8, 20, 4);
        
        // 文字区域背景（浅米色，半透明）- 适中空间
        this.dialogBox.fillStyle(0xF5DEB3, 0.3); // 浅米色
        this.dialogBox.fillRoundedRect(dialogX + 8, dialogY + 35, dialogWidth - 16, dialogHeight - 85, 4);
        
        // 木头纹理边框
        this.dialogBox.lineStyle(3, 0x654321, 1); // 深木色边框
        this.dialogBox.strokeRoundedRect(dialogX, dialogY, dialogWidth, dialogHeight, 8);
        
        // 内边框装饰
        this.dialogBox.lineStyle(1, 0xD2B48C, 0.8); // 浅木色内边框
        this.dialogBox.strokeRoundedRect(dialogX + 2, dialogY + 2, dialogWidth - 4, dialogHeight - 4, 6);

        // TODO: 预留贴图功能
        // 未来可以用这个方法替换上面的graphics绘制：
        // this.dialogBg = this.add.image(dialogX, dialogY, 'dialog_bg');
        // this.dialogBg.setOrigin(0, 0);
        // this.dialogBg.setDisplaySize(dialogWidth, dialogHeight);

        // 🔧 文本显示区域 - 限制高度避免遮挡输入框
        const textAreaX = dialogX + 20;
        const textAreaY = dialogY + 20;
        const textAreaWidth = dialogWidth - 40;
        const textAreaHeight = dialogHeight - 110; // 🔧 为输入框预留空间
        
        this.dialogText = this.add.text(textAreaX, textAreaY + 15, '', {
            fontSize: `${this.CHAT_FONT_SIZE}px`,
            fontFamily: 'sans-serif',   // 与 measureText 使用同一字体，确保折行一致
            fontStyle: 'normal',
            color: '#2F1B14',
            // ⚠️ 不用 wordWrap：折行由 buildVisualLines 精确控制，直接传 \n 连接的行
            lineSpacing: 2,
            padding: { x: 4, y: 2 },
            align: 'left',
            fixedWidth: textAreaWidth,
            fixedHeight: textAreaHeight,
            maxLines: this.CHAT_VISIBLE_LINES + 2
        });

        // 输入框背景 - 适应调整后的对话框高度
        const inputBoxX = dialogX + 15;
        const inputBoxY = dialogY + dialogHeight - 45; // 合适的位置
        const inputBoxWidth = dialogWidth - 30;
        const inputBoxHeight = 30; // 标准高度
        
        this.dialogInputBox = this.add.graphics();
        // 木头风格输入框
        this.dialogInputBox.fillStyle(0xF5DEB3, 0.9); // 浅米色背景
        this.dialogInputBox.fillRoundedRect(inputBoxX, inputBoxY, inputBoxWidth, inputBoxHeight, 4);
        this.dialogInputBox.lineStyle(2, 0x8B4513, 1); // 深棕色边框
        this.dialogInputBox.strokeRoundedRect(inputBoxX, inputBoxY, inputBoxWidth, inputBoxHeight, 4);

        // 输入文本
        this.dialogInput = this.add.text(inputBoxX + 10, inputBoxY + 8, '', {
            fontSize: '18px', // 增加字体大小
            fontStyle: 'bold', // 加粗
            color: '#654321' // 深木色文字
        });

        // ESC退出提示文字 - 右下角
        this.escHintText = this.add.text(dialogX + dialogWidth - 15, dialogY + dialogHeight - 30, '按esc退出', {
            fontSize: '14px',
            color: '#8B4513', // 深棕色，稍微淡一些
            alpha: 0.7 // 半透明效果
        });
        this.escHintText.setOrigin(1, 0); // 右对齐

        // 提示文本 - 跟随NPC显示
        this.promptText = this.add.text(0, 0, '', {
            fontSize: '16px',
            color: '#ffff00',
            align: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            padding: { x: 8, y: 4 }
        });
        this.promptText.setOrigin(0.5);

        // 完全不使用容器，独立管理每个元素
        // 设置所有元素为固定在屏幕上
        this.dialogBox.setScrollFactor(0);
        this.dialogText.setScrollFactor(0);
        this.dialogInputBox.setScrollFactor(0);
        this.dialogInput.setScrollFactor(0);
        this.escHintText.setScrollFactor(0);
        this.promptText.setScrollFactor(0);
        
        // 设置明确的深度层级，文本在最上层
        this.dialogBox.setDepth(5000);
        this.dialogInputBox.setDepth(5001);
        this.dialogInput.setDepth(5003);
        this.escHintText.setDepth(5003);
        this.promptText.setDepth(5004);
        this.dialogText.setDepth(5005); // 文本在最高层级
        
        // 初始状态设为隐藏
        this.dialogBox.setVisible(false);
        this.dialogText.setVisible(false);
        this.dialogInputBox.setVisible(false);
        this.dialogInput.setVisible(false);
        this.escHintText.setVisible(false);
        
        // 不添加到容器，独立管理显示/隐藏
        // this.dialogContainer.add([...]);

        // 监听键盘输入
        this.input.keyboard.on('keydown', (event: KeyboardEvent) => {
            if (this.isInDialogMode) {
                this.handleDialogInput(event);
            }
        });

        // 记录真实 wrapWidth，供分页计算使用
        this.chatWrapWidth = textAreaWidth - 20;

        // 创建隐藏的输入框来支持中文输入
        this.createHiddenInputForChinese();
        
        // 注册鼠标滚轮事件，按「视觉行」滚动
        this.input.on('wheel', (_pointer: any, _gameObjects: any, _deltaX: number, deltaY: number) => {
            if (!this.isInDialogMode) return;
            
            const allLines = this.buildVisualLines();
            const maxOffset = Math.max(0, allLines.length - this.CHAT_VISIBLE_LINES);
            if (deltaY < 0) {
                // 向上滚：看更早的内容
                this.chatScrollOffset = Math.min(this.chatScrollOffset + 2, maxOffset);
            } else {
                // 向下滚：回到最新
                this.chatScrollOffset = Math.max(this.chatScrollOffset - 2, 0);
            }
            this.updateChatDisplay();
        });
    }

    /**
     * 更新对话系统
     */
    private updateDialogSystem(): void {
        if (!this.isInDialogMode) {
            // 检查玩家是否靠近原NPC
            // SmartNPC 已停用，距离设为无限远
            const distanceToNPC = Infinity;

            // 检查玩家是否靠近老刘
            let distanceToPolice = Infinity;
            const policeNPC = this.policeSystem?.getPoliceNPC();
            if (policeNPC) {
                distanceToPolice = Phaser.Math.Distance.Between(
                    this.player.x, this.player.y,
                    policeNPC.x, policeNPC.y
                );
            }

            // 检查玩家是否靠近老王
            let distanceToWang = Infinity;
            const wangNPC = this.nightPolice?.getNPC();
            if (wangNPC) {
                distanceToWang = Phaser.Math.Distance.Between(
                    this.player.x, this.player.y,
                    wangNPC.x, wangNPC.y
                );
            }

            const isNearNPC = distanceToNPC < 80;
            const isNearPolice = distanceToPolice < 80;
            const isNearWang = distanceToWang < 80;
            const isNear = isNearNPC || isNearPolice || isNearWang;

            if (isNear && !this.isNearNPC) {
                this.isNearNPC = true;
            } else if (!isNear && this.isNearNPC) {
                this.isNearNPC = false;
            }

            // 检查是否按下E键
            if (this.isNearNPC && Phaser.Input.Keyboard.JustDown(this.eKey)) {
                // 找最近的 NPC 对话
                const minDist = Math.min(distanceToPolice, distanceToWang, distanceToNPC);
                if (isNearPolice && distanceToPolice === minDist) {
                    this.startDialog('police');
                } else if (isNearWang && distanceToWang === minDist) {
                    this.startDialog('wang');
                } else if (isNearNPC) {
                    this.startDialog('npc');
                }
            }
        } else {
            // 在对话模式中，检查ESC键退出
            if (Phaser.Input.Keyboard.JustDown(this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC))) {
                this.endDialog();
            }
        }
    }

    /**
     * 显示交互提示 - 跟随NPC位置
     */
    private showInteractionPrompt(): void {
        this.promptText.setText('按 E 键对话');
        // 设置提示位置在NPC上方
        // SmartNPC 已停用，promptText 不再跟随旧 NPC
        // this.promptText.setPosition(this.npc.x, this.npc.y - 100);
        this.promptText.setVisible(true);
    }

    /**
     * 隐藏交互提示
     */
    private hideInteractionPrompt(): void {
        this.promptText.setVisible(false);
    }

    /**
     * 🚀 开始对话 - 支持不同NPC类型
     */
    private currentDialogNPC: 'npc' | 'police' | 'wang' | null = null;
    
    private startDialog(npcType: 'npc' | 'police' | 'wang' = 'npc'): void {
        this.currentDialogNPC = npcType;
        
        if (npcType === 'police') {
            console.log('👮‍♂️ 开始与老刘对话');
            this.policeSystem?.getPoliceOfficer()?.pausePatrol();
        } else if (npcType === 'wang') {
            console.log('🌙 开始与老王对话');
            this.nightPolice?.pausePatrol();
        } else {
            console.log('💬 开始与NPC对话');
        }

        this.isInDialogMode = true;
        
        // 独立显示每个元素
        this.dialogBox.setVisible(true);
        this.dialogText.setVisible(true);
        this.dialogInputBox.setVisible(true);
        this.dialogInput.setVisible(true);
        this.escHintText.setVisible(true);
        
        // 初始化聊天记录，并重置滚动到最底部
        this.chatHistory = [];
        this.chatScrollOffset = 0;
        
        if (npcType === 'police') {
            this.addChatMessage('民警老刘', '哎，李家妹子，咋地了？\n有事儿说话！');
        } else if (npcType === 'wang') {
            this.addChatMessage('民警老王', '嗯。\n有事儿？');
        }
        
        // 重置输入
        this.currentInputText = '';
        this.dialogInput.setText('');
        this.hiddenInput.value = '';
        
        // 激活隐藏输入框以支持中文输入
        this.hiddenInput.focus();
        
        // 警察NPC的状态由PoliceOfficerNPC内部管理
    }

    /**
     * 结束对话
     */
    private endDialog(): void {
        console.log('💬 结束对话');
        this.isInDialogMode = false;
        
        // 独立隐藏每个元素
        this.dialogBox.setVisible(false);
        this.dialogText.setVisible(false);
        this.dialogInputBox.setVisible(false);
        this.dialogInput.setVisible(false);
        this.escHintText.setVisible(false);
        
        this.currentInputText = '';
        
        // 取消隐藏输入框焦点
        this.hiddenInput.blur();
        this.hiddenInput.value = '';
        
        // 恢复警察巡逻
        if (this.currentDialogNPC === 'police') {
            this.policeSystem?.getPoliceOfficer()?.resumePatrol();
        } else if (this.currentDialogNPC === 'wang') {
            this.nightPolice?.resumePatrol();
        }
        this.currentDialogNPC = null;
    }

    /**
     * 处理对话输入 - 简化版本，主要由隐藏输入框处理
     */
    private handleDialogInput(event: KeyboardEvent): void {
        // 只处理ESC键，其他输入交给隐藏输入框处理
        if (event.key === 'Escape') {
            event.preventDefault();
            this.endDialog();
        }
    }

    /**
     * 🚀 发送消息给NPC - 支持不同NPC类型
     */
    private async sendMessage(message: string): Promise<void> {
        console.log(`📤 玩家: ${message}`);
        
        // 立即添加玩家消息到聊天记录
        this.addChatMessage('你', message);
        
        if (this.currentDialogNPC === 'police') {
            // 与老刘对话
            this.addChatMessage('民警老刘', '（思考中...）');
            try {
                const response = await this.handlePoliceDialog(message);
                this.replaceLastMessage('民警老刘', response);
            } catch (error) {
                console.error('老刘AI对话失败:', error);
                this.replaceLastMessage('民警老刘', '得了，我这儿有点事儿。\n回头再唠！');
            }
        } else if (this.currentDialogNPC === 'wang') {
            // 与老王对话
            this.addChatMessage('民警老王', '（思考中...）');
            try {
                const response = await this.nightPolice.handleConversation(message);
                this.replaceLastMessage('民警老王', response);
            } catch (error) {
                console.error('老王AI对话失败:', error);
                this.replaceLastMessage('民警老王', '行了。\n回头说。');
            }
        }
    }

    /**
     * 替换聊天记录中最后一条指定说话者的消息
     */
    private replaceLastMessage(speaker: string, newContent: string): void {
        // 空内容保护 + 换行符统一处理（和 addChatMessage 保持一致）
        const safeContent = (newContent && newContent.trim()) 
            ? newContent.replace(/\r?\n/g, ' ').trim()
            : '...（无回复）';
        
        // 找到最后一条该说话者的消息并替换
        for (let i = this.chatHistory.length - 1; i >= 0; i--) {
            if (this.chatHistory[i].startsWith(`${speaker}: `)) {
                this.chatHistory[i] = `${speaker}: ${safeContent}`;
                this.updateDialogText();
                return;
            }
        }
        // 如果没找到则直接添加
        this.addChatMessage(speaker, safeContent);
    }

    /**
     * 更新对话文本显示（替换消息后调用）
     */
    private updateDialogText(): void {
        this.updateChatDisplay();
    }

    /**
     * 创建隐藏的输入框来支持中文输入
     */
    private createHiddenInputForChinese(): void {
        // 创建隐藏的HTML输入框
        this.hiddenInput = document.createElement('input');
        this.hiddenInput.type = 'text';
        this.hiddenInput.style.position = 'absolute';
        this.hiddenInput.style.top = '-9999px'; // 隐藏在屏幕外
        this.hiddenInput.style.left = '-9999px';
        this.hiddenInput.style.opacity = '0';
        this.hiddenInput.style.pointerEvents = 'none';
        this.hiddenInput.maxLength = 100;
        
        // 添加到DOM
        document.body.appendChild(this.hiddenInput);

        // 监听输入变化
        this.hiddenInput.addEventListener('input', (event) => {
            if (this.isInDialogMode) {
                const target = event.target as HTMLInputElement;
                this.currentInputText = target.value;
                this.dialogInput.setText(this.currentInputText);
                console.log('🇨🇳 中文输入:', this.currentInputText);
            }
        });

        // 监听键盘事件（处理回车、退格等）
        this.hiddenInput.addEventListener('keydown', (event) => {
            if (this.isInDialogMode) {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    if (this.currentInputText.trim()) {
                        this.sendMessage(this.currentInputText); // async调用，不需要await
                        this.currentInputText = '';
                        this.hiddenInput.value = '';
                        this.dialogInput.setText('');
                    }
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    this.endDialog();
                }
            }
        });
    }
    
    /**
     * � 添加聊天消息并更新显示 - 让Phaser自动换行
     */
    private addChatMessage(sender: string, message?: string): void {
        let content: string;
        if (message) {
            // 把消息内所有换行符替换成空格，统一由 wordWrap 处理折行
            content = message.replace(/\r?\n/g, ' ').trim();
            this.chatHistory.push(`${sender}: ${content}`);
        } else {
            this.chatHistory.push(sender);
        }
        // 新消息到达，自动跳到最底部
        this.chatScrollOffset = 0;
        this.updateChatDisplay();
    }

    /**
     * 获取测量用 Canvas Context（懒初始化）
     */
    private getMeasureCtx(): CanvasRenderingContext2D {
        if (!this._measureCtx) {
            const canvas = document.createElement('canvas');
            this._measureCtx = canvas.getContext('2d')!;
        }
        this._measureCtx.font = `${this.CHAT_FONT_SIZE}px sans-serif`;
        return this._measureCtx;
    }

    /**
     * 用 Canvas measureText 精确折行，返回该条消息折成的视觉行数组
     */
    private wrapTextToLines(text: string): string[] {
        const ctx = this.getMeasureCtx();
        const maxWidth = this.chatWrapWidth;
        const result: string[] = [];
        let line = '';

        for (const char of text) {
            const testLine = line + char;
            if (ctx.measureText(testLine).width > maxWidth && line.length > 0) {
                result.push(line);
                line = char;
            } else {
                line = testLine;
            }
        }
        if (line) result.push(line);
        return result.length > 0 ? result : [''];
    }

    /**
     * 把所有历史消息精确拆成视觉行，消息间插入空行分隔
     */
    private buildVisualLines(): string[] {
        const lines: string[] = [];
        for (let i = 0; i < this.chatHistory.length; i++) {
            const msgLines = this.wrapTextToLines(this.chatHistory[i]);
            lines.push(...msgLines);
            // 消息之间加空行（最后一条不加）
            if (i < this.chatHistory.length - 1) {
                lines.push('');
            }
        }
        return lines;
    }

    /**
     * 更新聊天显示 - 按「视觉行」截取并渲染
     */
    private updateChatDisplay(): void {
        const allLines = this.buildVisualLines();
        const total = allLines.length;
        const visible = this.CHAT_VISIBLE_LINES;

        // offset=0 显示最后 visible 行；offset 越大越往上翻
        const endIdx = Math.max(total - this.chatScrollOffset, 0);
        const startIdx = Math.max(endIdx - visible, 0);
        const slice = allLines.slice(startIdx, endIdx);

        this.dialogText.setText(slice.join('\n'));

        // 更新滚动提示
        const canScrollUp = startIdx > 0;
        const canScrollDown = this.chatScrollOffset > 0;
        this.updateScrollHint(canScrollUp, canScrollDown);
    }

    /**
     * 更新滚动提示文字
     */
    private updateScrollHint(canScrollUp: boolean, canScrollDown: boolean): void {
        if (!this.escHintText) return;
        let hint = '按esc退出';
        if (canScrollUp || canScrollDown) {
            hint = '↑↓滚轮翻页  ' + hint;
        }
        this.escHintText.setText(hint);
    }
}