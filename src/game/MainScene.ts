import Phaser from 'phaser';

export class MainScene extends Phaser.Scene {
    private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private background!: Phaser.GameObjects.TileSprite;

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
    private roofAlphaSpeed = 0.1; // 增加速度，更快的透明度变化
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

        // 创建玩家角色（起始位置在世界中心）
        this.player = this.physics.add.sprite(this.WORLD_WIDTH / 2, this.WORLD_HEIGHT / 2, 'player');

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

        // 创建建筑屋顶（基于2048x2048完整屋顶图）
        this.createBuildingRoofs();
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

        // 使用像素检测方案更新屋顶透明度
        this.updateRoofTransparencyByPixelDetection();
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
            const alpha = pixelData[3];
            // 调试输出
            if (alpha > 0) {
                console.log(`DEBUG: ${roofKey} has roof at (${x}, ${y}), alpha=${alpha}`);
            }
            // 检查alpha通道是否大于0（有像素）
            return alpha > 0; // alpha > 0
        } catch (e) {
            console.warn('Failed to get pixel data at', x, y, roofKey);
            return false;
        }
    }

    private updateRoofTransparencyByPixelDetection() {
        // 获取玩家当前位置（整数坐标）
        const playerX = Math.floor(this.player.x);
        const playerY = Math.floor(this.player.y);

        const roofKeys = ['roof_home', 'roof_cafe', 'roof_store'];

        // 先重置所有屋顶为不透明
        roofKeys.forEach(key => {
            const roofSprite = this.roofSprites.get(key);
            if (roofSprite) {
                roofSprite.setAlpha(1.0);
            }
        });

        // 检查玩家当前位置是否有任何屋顶像素
        roofKeys.forEach(key => {
            if (this.hasRoofPixelAt(playerX, playerY, key)) {
                const roofSprite = this.roofSprites.get(key);
                if (roofSprite) {
                    roofSprite.setAlpha(0.0); // 直接设置透明
                }
            }
        });
    }
}