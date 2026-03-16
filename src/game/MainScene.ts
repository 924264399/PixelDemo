import Phaser from 'phaser';

export class MainScene extends Phaser.Scene {
    private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
    private background!: Phaser.GameObjects.Image;

    constructor() {
        super('MainScene');
    }

    preload() {
        // 加载背景图和玩家角色
        this.load.image('background', 'assets/scene.png');
        this.load.image('player', 'assets/player.png');
    }

    create() {
        // 获取浏览器窗口尺寸
        const width = window.innerWidth;
        const height = window.innerHeight;

        // 设置世界边界为浏览器尺寸
        this.physics.world.setBounds(0, 0, width, height);

        // 添加背景并调整大小以适应整个屏幕
        this.background = this.add.image(0, 0, 'background');
        this.background.setOrigin(0, 0);
        this.background.displayWidth = width;
        this.background.displayHeight = height;

        // 创建玩家角色（居中位置）
        this.player = this.physics.add.sprite(width / 2, height / 2, 'player');

        // 设置玩家物理属性
        this.player.setCollideWorldBounds(true);
        this.player.setBounce(0.2);
        this.player.setDrag(500);

        // 设置键盘输入
        this.cursors = this.input.keyboard.createCursorKeys();

        // 监听窗口大小变化
        window.addEventListener('resize', () => {
            const newWidth = window.innerWidth;
            const newHeight = window.innerHeight;

            // 更新世界边界
            this.physics.world.setBounds(0, 0, newWidth, newHeight);

            // 调整背景大小
            this.background.displayWidth = newWidth;
            this.background.displayHeight = newHeight;

            // 更新相机（如果需要）
            this.cameras.main.setSize(newWidth, newHeight);
        });
    }

    update() {
        // 重置玩家速度
        this.player.setVelocity(0);

        // 处理键盘输入
        if (this.cursors.left.isDown) {
            this.player.setVelocityX(-160);
        } else if (this.cursors.right.isDown) {
            this.player.setVelocityX(160);
        }

        if (this.cursors.up.isDown) {
            this.player.setVelocityY(-160);
        } else if (this.cursors.down.isDown) {
            this.player.setVelocityY(160);
        }
    }
}