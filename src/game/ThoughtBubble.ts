import Phaser from 'phaser';
import { NPC } from './NPC';

/**
 * NPC 内心独白气泡
 * 
 * 样式：淡黄背景 + 底部三个小圆点（区别于白色对话气泡）
 * 用法：bubble.show('媳妇在干啥呢...', 4000)
 */
export class ThoughtBubble {
    private scene: Phaser.Scene;
    private npc: NPC;

    private background: Phaser.GameObjects.Graphics | null = null;
    private textObj: Phaser.GameObjects.Text | null = null;
    private hideTimer: Phaser.Time.TimerEvent | null = null;

    private currentWidth = 0;

    constructor(scene: Phaser.Scene, npc: NPC) {
        this.scene = scene;
        this.npc = npc;
    }

    /**
     * 显示内心独白
     * @param message 短句（建议 ≤ 12 字）
     * @param duration 显示时长 ms，默认 4000
     */
    show(message: string, duration = 4000): void {
        this.hide();

        // ── 文字 ────────────────────────────────────────────
        this.textObj = this.scene.add.text(0, 0, message, {
            fontSize: '13px',
            color: '#5a3e00',
            fontStyle: 'italic',
        });
        this.textObj.setDepth(2001);

        const tw = this.textObj.width;
        const th = this.textObj.height;
        const padX = 10;
        const padY = 6;
        const bw = tw + padX * 2;
        const bh = th + padY * 2;
        this.currentWidth = bw;

        // ── 背景 ────────────────────────────────────────────
        this.background = this.scene.add.graphics();
        this.background.setDepth(2000);

        // 淡黄填充
        this.background.fillStyle(0xfffbe6, 0.92);
        this.background.lineStyle(1.5, 0xc8a800, 0.7);
        this.background.fillRoundedRect(0, 0, bw, bh, 8);
        this.background.strokeRoundedRect(0, 0, bw, bh, 8);

        // 底部三个小圆点（思考感）
        const dotY = bh + 5;
        const dotR = 2.5;
        const dotSpacing = 7;
        const dotStartX = bw / 2 - dotSpacing;
        this.background.fillStyle(0xc8a800, 0.7);
        for (let i = 0; i < 3; i++) {
            this.background.fillCircle(dotStartX + i * dotSpacing, dotY, dotR - i * 0.4);
        }

        this.updatePosition();

        // ── 自动隐藏 ─────────────────────────────────────────
        this.hideTimer = this.scene.time.delayedCall(duration, () => this.hide());
    }

    /** 每帧调用，让气泡跟随 NPC 移动 */
    update(): void {
        if (this.background && this.textObj) {
            this.updatePosition();
        }
    }

    private updatePosition(): void {
        if (!this.background || !this.textObj) return;
        const x = this.npc.x - this.currentWidth / 2;
        const y = this.npc.y - 70;
        this.background.setPosition(x, y);
        this.textObj.setPosition(x + 10, y + 6);
    }

    hide(): void {
        this.hideTimer?.destroy();
        this.hideTimer = null;
        this.background?.destroy();
        this.background = null;
        this.textObj?.destroy();
        this.textObj = null;
    }

    destroy(): void {
        this.hide();
    }

    isShowing(): boolean {
        return this.background !== null;
    }
}
