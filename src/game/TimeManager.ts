/**
 * 游戏时间管理系统
 * 1 现实分钟 = 游戏 1 小时
 */

export class TimeManager {
    private scene: Phaser.Scene;
    private gameTime: number = 6 * 60; // 游戏时间（分钟），默认早上6:00
    private lastUpdateTime: number = 0;
    private timeSpeed: number = 60; // 1 现实分钟 = 60 游戏分钟 = 1 游戏小时
    
    // UI 元素
    private timeDisplay!: Phaser.GameObjects.Text;
    private clockBackground!: Phaser.GameObjects.Graphics;
    private nightOverlay!: Phaser.GameObjects.Graphics;
    private timeInputBox!: Phaser.GameObjects.Graphics;
    private timeInputText!: Phaser.GameObjects.Text;
    private timeInputActive: boolean = false;
    private currentTimeInput: string = '';

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.lastUpdateTime = Date.now();
        this.createTimeUI();
        this.createNightOverlay();
        this.setupTimeInput();
    }

    /**
     * 创建时间显示UI
     */
    private createTimeUI(): void {
        const x = this.scene.cameras.main.width - 120;
        const y = this.scene.cameras.main.height - 80;

        // 时钟背景
        this.clockBackground = this.scene.add.graphics();
        this.clockBackground.fillStyle(0x8B4513, 0.8); // 木头色背景
        this.clockBackground.fillRoundedRect(x - 10, y - 10, 100, 60, 8);
        this.clockBackground.lineStyle(2, 0x654321, 1);
        this.clockBackground.strokeRoundedRect(x - 10, y - 10, 100, 60, 8);

        // 时间显示文本
        this.timeDisplay = this.scene.add.text(x, y, this.formatTime(), {
            fontSize: '16px',
            fontStyle: 'bold',
            color: '#F5DEB3',
            align: 'center'
        });

        // 添加点击事件来切换时间输入
        this.clockBackground.setInteractive(new Phaser.Geom.Rectangle(x - 10, y - 10, 100, 60), Phaser.Geom.Rectangle.Contains);
        this.clockBackground.on('pointerdown', () => {
            this.toggleTimeInput();
        });

        // 设置UI固定位置
        this.clockBackground.setScrollFactor(0);
        this.timeDisplay.setScrollFactor(0);
        this.clockBackground.setDepth(10000);
        this.timeDisplay.setDepth(10001);
    }

    /**
     * 创建夜晚覆盖层
     */
    private createNightOverlay(): void {
        const width = this.scene.cameras.main.width;
        const height = this.scene.cameras.main.height;

        this.nightOverlay = this.scene.add.graphics();
        this.nightOverlay.fillStyle(0x000033, 0.6); // 深蓝黑色，透明度0.6
        this.nightOverlay.fillRect(0, 0, width, height);
        this.nightOverlay.setScrollFactor(0);
        this.nightOverlay.setDepth(9000); // 在游戏内容之上，但在UI之下
        this.nightOverlay.setVisible(false); // 初始隐藏
    }

    /**
     * 设置时间输入功能
     */
    private setupTimeInput(): void {
        const x = this.scene.cameras.main.width - 120;
        const y = this.scene.cameras.main.height - 120;

        // 时间输入框背景
        this.timeInputBox = this.scene.add.graphics();
        this.timeInputBox.fillStyle(0xF5DEB3, 0.95);
        this.timeInputBox.fillRoundedRect(x - 20, y - 5, 120, 30, 4);
        this.timeInputBox.lineStyle(2, 0x8B4513, 1);
        this.timeInputBox.strokeRoundedRect(x - 20, y - 5, 120, 30, 4);

        // 时间输入文本
        this.timeInputText = this.scene.add.text(x - 15, y, '输入时间 (HH:MM)', {
            fontSize: '12px',
            color: '#654321'
        });

        // 设置UI属性
        this.timeInputBox.setScrollFactor(0);
        this.timeInputText.setScrollFactor(0);
        this.timeInputBox.setDepth(10002);
        this.timeInputText.setDepth(10003);
        this.timeInputBox.setVisible(false);
        this.timeInputText.setVisible(false);

        // 监听键盘输入
        this.scene.input.keyboard.on('keydown', (event: KeyboardEvent) => {
            if (this.timeInputActive) {
                this.handleTimeInput(event);
            }
        });
    }

    /**
     * 切换时间输入模式
     */
    private toggleTimeInput(): void {
        this.timeInputActive = !this.timeInputActive;
        this.timeInputBox.setVisible(this.timeInputActive);
        this.timeInputText.setVisible(this.timeInputActive);
        
        if (this.timeInputActive) {
            this.currentTimeInput = '';
            this.timeInputText.setText('输入时间 (HH:MM)');
        }
    }

    /**
     * 处理时间输入
     */
    private handleTimeInput(event: KeyboardEvent): void {
        if (event.code === 'Escape') {
            this.toggleTimeInput();
            return;
        }

        if (event.code === 'Enter') {
            this.parseAndSetTime(this.currentTimeInput);
            this.toggleTimeInput();
            return;
        }

        if (event.code === 'Backspace') {
            this.currentTimeInput = this.currentTimeInput.slice(0, -1);
            this.timeInputText.setText(this.currentTimeInput || '输入时间 (HH:MM)');
            return;
        }

        // 只接受数字和冒号
        if (/^[0-9:]$/.test(event.key)) {
            if (this.currentTimeInput.length < 5) { // HH:MM 最多5个字符
                this.currentTimeInput += event.key;
                this.timeInputText.setText(this.currentTimeInput);
            }
        }
    }

    /**
     * 解析并设置时间
     */
    private parseAndSetTime(timeStr: string): void {
        const timePattern = /^(\d{1,2}):(\d{2})$/;
        const match = timeStr.match(timePattern);
        
        if (match) {
            const hours = parseInt(match[1]);
            const minutes = parseInt(match[2]);
            
            if (hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60) {
                this.gameTime = hours * 60 + minutes;
                console.log(`🕐 时间设置为: ${this.formatTime()}`);
                return;
            }
        }
        
        console.log('❌ 时间格式错误，请使用 HH:MM 格式');
    }

    /**
     * 更新时间系统
     */
    update(): void {
        const now = Date.now();
        const deltaTime = (now - this.lastUpdateTime) / 1000; // 转换为秒
        this.lastUpdateTime = now;

        // 更新游戏时间（1 现实分钟 = 1 游戏小时）
        this.gameTime += deltaTime * this.timeSpeed / 60; // 每秒增加1游戏分钟

        // 确保时间在24小时循环内
        if (this.gameTime >= 24 * 60) {
            this.gameTime -= 24 * 60;
        }

        this.updateTimeDisplay();
        this.updateNightOverlay();
    }

    /**
     * 更新时间显示
     */
    private updateTimeDisplay(): void {
        this.timeDisplay.setText(this.formatTime());
    }

    /**
     * 更新夜晚覆盖层
     */
    private updateNightOverlay(): void {
        const hour = Math.floor(this.gameTime / 60);
        let nightIntensity = 0;

        // 夜晚时间定义：20:00 - 06:00
        if (hour >= 20 || hour < 6) {
            // 夜晚
            if (hour >= 20) {
                // 20:00 - 24:00，逐渐变暗
                nightIntensity = Math.min(0.7, (hour - 20) * 0.175 + 0.3);
            } else {
                // 00:00 - 06:00，保持暗度然后逐渐变亮
                if (hour < 5) {
                    nightIntensity = 0.7; // 深夜保持最暗
                } else {
                    // 05:00 - 06:00，逐渐变亮
                    nightIntensity = 0.7 - (hour - 5) * 0.7;
                }
            }
        } else if (hour >= 18 && hour < 20) {
            // 黄昏 18:00 - 20:00，逐渐变暗
            nightIntensity = (hour - 18) * 0.15;
        } else if (hour >= 6 && hour < 8) {
            // 黎明 06:00 - 08:00，逐渐变亮
            nightIntensity = Math.max(0, 0.3 - (hour - 6) * 0.15);
        }

        if (nightIntensity > 0) {
            this.nightOverlay.setVisible(true);
            this.nightOverlay.setAlpha(nightIntensity);
        } else {
            this.nightOverlay.setVisible(false);
        }
    }

    /**
     * 格式化时间显示
     */
    private formatTime(): string {
        const totalMinutes = Math.floor(this.gameTime);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    /**
     * 获取当前游戏时间（小时）
     */
    getHour(): number {
        return Math.floor(this.gameTime / 60);
    }

    /**
     * 获取当前游戏时间（分钟）
     */
    getMinute(): number {
        return Math.floor(this.gameTime) % 60;
    }

    /**
     * 判断是否为夜晚
     */
    isNight(): boolean {
        const hour = this.getHour();
        return hour >= 20 || hour < 6;
    }

    /**
     * 销毁时间管理器
     */
    destroy(): void {
        this.timeDisplay?.destroy();
        this.clockBackground?.destroy();
        this.nightOverlay?.destroy();
        this.timeInputBox?.destroy();
        this.timeInputText?.destroy();
    }
}