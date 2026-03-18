import Phaser from 'phaser';
import { NPC, NPCConfig, NPCState } from './NPC';
import { PathPlanner, Waypoint } from './PathPlanner';
import { CafeWorkerAgent, NPCPersonality } from './AIAgent';
import { SmartNPC, SceneManager } from './SmartNPC';
import { TimeManager } from './TimeManager';

export class MainScene extends Phaser.Scene {
    private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    private npc!: NPC; // 单个NPC实例
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
    private chatHistory: string[] = []; // 聊天记录
    private maxChatLines = 8; // 最大显示行数

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
        this.load.image('player', 'assets/player.png');
        this.load.image('roof_home', 'assets/roof_home.png');
        this.load.image('roof_store', 'assets/roof_store.png');
        this.load.image('roof_cafe', 'assets/roof_cafe.png');
        this.load.image('collision_mask', 'assets/collision_mask.png');
        this.load.image('indoor_outdoor_mask', 'assets/indoor_outdoor_mask.png');
        this.load.image('npc1', 'assets/npc1.png');
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
    }

    private createNPC() {
        const npcConfig: NPCConfig = {
            id: 'npc_1',
            name: '咖啡店员',
            startX: 992,  // 咖啡馆门口
            startY: 820,
            speed: 80,
            texture: 'npc1'
        };

        // 创建智能NPC（具备场景感知能力）
        this.npc = new SmartNPC(this, npcConfig);

        // 设置NPC碰撞检测器
        this.npc.setCollisionChecker((x, y) => this.checkCollisionAt(x, y));

        // 设置NPC自动巡逻（示例：咖啡馆 → 便利店）
        this.setupNPCTask();
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

        // 更新NPC（关键修复：确保NPC能够移动）
        this.npc.update();

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

        // 白色表示碰撞体（r+g+b > 阈值）
        return (r + g + b) > 500; // 白色阈值
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
        const npcX = Math.floor(this.npc.x);
        const npcY = Math.floor(this.npc.y);
        const roofKeys = ['roof_home', 'roof_cafe', 'roof_store'];

        // 更新目标透明度 - 考虑玩家和NPC位置
        roofKeys.forEach(key => {
            const playerUnderRoof = this.hasRoofPixelAt(playerX, playerY, key);
            const npcUnderRoof = this.hasRoofPixelAt(npcX, npcY, key);
            
            // 混合策略：玩家优先，但NPC也有影响
            let targetAlpha = 1.0;
            if (playerUnderRoof) {
                targetAlpha = 0.0; // 玩家在屋内，完全透明
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
     * 动态图层排序 - 基于Y坐标的深度排序
     */
    private updateDepthSorting(): void {
        // 获取玩家和NPC的Y坐标
        const playerY = this.player.y;
        const npcY = this.npc.y;

        // 基础深度值
        const basePlayerDepth = 100;
        const baseNPCDepth = 100;

        // 根据Y坐标设置深度（Y值越大，越靠前显示）
        this.player.setDepth(basePlayerDepth + Math.floor(playerY));
        this.npc.setDepth(baseNPCDepth + Math.floor(npcY));

        // 确保气泡始终在最上层
        if ((this.npc as SmartNPC).speechBubble) {
            // 气泡深度比NPC高1000
            const bubbleDepth = baseNPCDepth + Math.floor(npcY) + 1000;
            // 这里我们无法直接设置气泡深度，因为它在SmartNPC类内部管理
            // 气泡系统已经设置了足够高的深度(2000+)
        }
    }

    /**
     * 初始化对话系统
     */
    private initDialogSystem(): void {
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        // 对话框尺寸调整：宽度缩小一半，高度增加一倍
        const dialogWidth = (screenWidth - 100) / 2; // 宽度缩小一半
        const dialogHeight = 300; // 高度增加一倍（原来150）
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
        
        // 文字区域背景（浅米色，半透明）- 为更大字体预留更多空间
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

        // 解决方案：文字放回对话框内，但确保在背景之上
        const textAreaX = dialogX + 20;
        const textAreaY = dialogY + 20; // 重新放回对话框内
        const textAreaWidth = dialogWidth - 40;
        
        this.dialogText = this.add.text(textAreaX, textAreaY + 15, '', { // 向下移动15像素避开顶部边框
            fontSize: '18px', // 增加字体大小
            fontStyle: 'bold', // 加粗
            color: '#2F1B14', // 深棕色文字，在米色背景上清晰可见
            wordWrap: { width: textAreaWidth },
            lineSpacing: 8, // 增加行间距
            padding: { x: 8, y: 8 }
        });

        // 输入框背景 - 简化设计避免遮挡
        const inputBoxX = dialogX + 15;
        const inputBoxY = dialogY + dialogHeight - 45;
        const inputBoxWidth = dialogWidth - 30;
        const inputBoxHeight = 30;
        
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

        // 创建隐藏的输入框来支持中文输入
        this.createHiddenInputForChinese();
    }

    /**
     * 更新对话系统
     */
    private updateDialogSystem(): void {
        if (!this.isInDialogMode) {
            // 检查玩家是否靠近NPC
            const distance = Phaser.Math.Distance.Between(
                this.player.x, this.player.y,
                this.npc.x, this.npc.y
            );

            const isNear = distance < 80; // 80像素范围内

            if (isNear && !this.isNearNPC) {
                // 刚接近NPC
                this.isNearNPC = true;
                // 不再显示交互提示
                // this.showInteractionPrompt();
            } else if (!isNear && this.isNearNPC) {
                // 离开NPC
                this.isNearNPC = false;
                // this.hideInteractionPrompt();
            }

            // 取消提示位置更新
            // if (this.isNearNPC && this.promptText.visible) {
            //     this.promptText.setPosition(this.npc.x, this.npc.y - 100);
            // }

            // 检查是否按下E键
            if (this.isNearNPC && Phaser.Input.Keyboard.JustDown(this.eKey)) {
                this.startDialog();
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
        this.promptText.setPosition(this.npc.x, this.npc.y - 100);
        this.promptText.setVisible(true);
    }

    /**
     * 隐藏交互提示
     */
    private hideInteractionPrompt(): void {
        this.promptText.setVisible(false);
    }

    /**
     * 开始对话
     */
    private startDialog(): void {
        console.log('💬 开始与NPC对话');
        this.isInDialogMode = true;
        
        // 独立显示每个元素
        this.dialogBox.setVisible(true);
        this.dialogText.setVisible(true);
        this.dialogInputBox.setVisible(true);
        this.dialogInput.setVisible(true);
        this.escHintText.setVisible(true);
        
        // 不需要隐藏交互提示，因为已经不显示了
        // this.hideInteractionPrompt();
        
        // 初始化聊天记录
        this.chatHistory = [];
        this.addChatMessage(`${this.npc.getName()}: 你好！有什么可以帮助你的吗？`);
        
        // 重置输入
        this.currentInputText = '';
        this.dialogInput.setText('');
        this.hiddenInput.value = '';
        
        // 激活隐藏输入框以支持中文输入
        this.hiddenInput.focus();
        
        // 设置NPC为对话状态
        this.npc.setTalking();
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
        
        // 恢复NPC状态
        this.npc.setIdle();
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
     * 发送消息给NPC
     */
    private sendMessage(message: string): void {
        console.log(`📤 玩家: ${message}`);
        
        // 立即添加玩家消息到聊天记录
        this.addChatMessage(`玩家: ${message}`);
        
        // NPC延迟1秒后回复，模拟真实对话
        this.time.delayedCall(1000, () => {
            this.addChatMessage(`${this.npc.getName()}: 阿巴阿巴`);
        });
        
        // 这里可以接入大模型处理
        // this.time.delayedCall(1000, async () => {
        //     const response = await this.processNPCResponse(message);
        //     this.addChatMessage(`${this.npc.getName()}: ${response}`);
        // });
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
                        this.sendMessage(this.currentInputText);
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
     * 添加聊天消息并更新显示
     */
    private addChatMessage(message: string): void {
        // 添加消息到聊天记录
        this.chatHistory.push(message);
        
        // 如果超过最大行数，删除最早的消息（滚动效果）
        if (this.chatHistory.length > this.maxChatLines) {
            this.chatHistory.shift();
        }
        
        // 更新显示
        this.updateChatDisplay();
    }

    /**
     * 更新聊天显示
     */
    private updateChatDisplay(): void {
        // 将聊天记录合并为一个字符串，每行之间用换行符分隔
        const chatText = this.chatHistory.join('\n');
        this.dialogText.setText(chatText);
        
        // 添加滚动到底部的效果（可选）
        console.log(`💬 聊天记录更新，当前${this.chatHistory.length}行`);
    }
}