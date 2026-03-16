// Main entry point for the game
console.log('Pixel Town Demo - AI小镇游戏');

// Import Phaser and our main scene
import Phaser from 'phaser';
import { MainScene } from './game/MainScene';

// Get browser window dimensions
const screenWidth = window.innerWidth;
const screenHeight = window.innerHeight;

// Game configuration with full screen support
const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: screenWidth,
    height: screenHeight,
    backgroundColor: '#2d2d2d',
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        parent: 'game-container'
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: MainScene
};

// Initialize the game
const game = new Phaser.Game(config);

// Handle window resize
window.addEventListener('resize', () => {
    game.scale.resize(window.innerWidth, window.innerHeight);
});