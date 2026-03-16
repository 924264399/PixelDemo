import Phaser from 'phaser';

export class TestScene extends Phaser.Scene {
    constructor() {
        super('TestScene');
    }

    preload() {
        // 预加载资源
        console.log('Loading game assets...');
    }

    create() {
        // 创建游戏对象
        this.add.text(100, 100, 'Pixel Town Demo - Environment Ready!', {
            fontSize: '24px',
            fill: '#ffffff'
        });
        console.log('Game scene created successfully!');
    }
}