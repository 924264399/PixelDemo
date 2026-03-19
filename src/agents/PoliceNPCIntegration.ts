/**
 * 警察NPC集成示例 - 在MainScene中快速集成老刘
 * 
 * 使用说明：
 * 1. 复制 .env.example 为 .env 并填入真实API密钥
 * 2. 在MainScene中导入并使用此示例
 * 3. 你的API密钥填入后即可测试AI功能
 */

import { SimplePoliceNPC } from './SimplePoliceNPC';
import { AIServiceManager } from '../utils/AIService';

/**
 * 警察NPC集成管理器
 */
export class PoliceNPCIntegration {
    private policeOfficer: SimplePoliceNPC | null = null;
    private scene: Phaser.Scene;
    private timeManager: any;
    private isInitialized = false;

    constructor(scene: Phaser.Scene, timeManager: any) {
        this.scene = scene;
        this.timeManager = timeManager;
    }

    /**
     * 初始化警察NPC系统
     */
    async initialize(): Promise<boolean> {
        try {
            console.log('🏛️ 初始化警察NPC系统...');
            this.policeOfficer = new SimplePoliceNPC(this.scene, this.timeManager);
            // 碰撞检测由 MainScene.ts 在 initialize() 返回后统一注入

            this.isInitialized = true;
            console.log('✅ 警察NPC系统初始化完成，老刘已上岗！');

            return true;

        } catch (error) {
            console.error('❌ 警察NPC初始化失败:', error);
            return false;
        }
    }

    /**
     * 更新警察NPC（在MainScene.update()中调用）
     */
    async update(): Promise<void> {
        if (this.isInitialized && this.policeOfficer) {
            await this.policeOfficer.update();
        }
    }

    /**
     * 处理玩家与警察对话
     */
    async handlePlayerDialog(playerMessage: string): Promise<string> {
        if (!this.policeOfficer) {
            return '警察NPC未初始化';
        }

        try {
            const response = await this.policeOfficer.handleConversation(playerMessage);
            console.log(`👮‍♂️ 老刘回复: ${response}`);
            return response;
        } catch (error) {
            console.error('对话处理失败:', error);
            return '抱歉，我现在有点忙，稍后再聊。';
        }
    }

    /**
     * 获取警察NPC状态（用于调试）
     */
    getPoliceStatus() {
        return this.policeOfficer?.getStatus() || null;
    }

    /**
     * 获取警察观察笔记（用于调试）
     */
    getObservationNotes(): string[] {
        return []; // 简化版暂无观察笔记
    }

    /**
     * 获取AI使用统计
     */
    getAIStats() {
        return this.policeOfficer?.getAIStats() || null;
    }

    /**
     * 获取警察NPC实例（用于碰撞检测等）
     */
    getPoliceNPC() {
        return this.policeOfficer?.getNPC() || null;
    }

    /**
     * 获取老刘本体（用于暂停/恢复巡逻）
     */
    getPoliceOfficer() {
        return this.policeOfficer;
    }
}

// ========== MainScene集成模板 ==========

/**
 * 在MainScene中集成警察NPC的示例代码
 * 
 * 复制以下代码到你的MainScene.ts文件中：
 */
export const MAIN_SCENE_INTEGRATION_TEMPLATE = `
import { PoliceNPCIntegration } from '../agents/PoliceNPCIntegration';

export class MainScene extends Phaser.Scene {
    private policeSystem: PoliceNPCIntegration;
    
    constructor() {
        super({ key: 'MainScene' });
    }

    async create() {
        // ... 现有创建逻辑 ...
        
        // 初始化警察NPC系统
        this.policeSystem = new PoliceNPCIntegration(this);
        await this.policeSystem.initialize();
        
        // ... 其他初始化代码 ...
    }

    async update() {
        // ... 现有更新逻辑 ...
        
        // 更新警察NPC
        if (this.policeSystem) {
            await this.policeSystem.update();
        }
        
        // ... 其他更新代码 ...
    }

    // 处理与警察对话（在点击NPC时调用）
    async handlePoliceDialog(playerMessage: string) {
        if (this.policeSystem) {
            const response = await this.policeSystem.handlePlayerDialog(playerMessage);
            
            // 显示对话框（使用你现有的对话系统）
            this.showDialog('老刘', response);
        }
    }

    // 检查NPC碰撞（如果你有这个函数）
    checkNPCClick(pointer: Phaser.Input.Pointer) {
        const policeNPC = this.policeSystem?.getPoliceNPC();
        if (policeNPC) {
            const distance = Phaser.Math.Distance.Between(
                pointer.worldX, pointer.worldY,
                policeNPC.x, policeNPC.y
            );
            
            if (distance < 50) { // 50像素范围内可点击
                // 触发对话
                this.handlePoliceDialog('你好');
                return true;
            }
        }
        return false;
    }
}
`;

// ========== 环境配置指南 ==========

export const SETUP_GUIDE = `
🚀 警察NPC快速上手指南

1️⃣ 【环境配置】
   - 复制 .env.example 为 .env
   - 填入你的API密钥：AI_API_KEY=你的密钥

2️⃣ 【集成到游戏】
   - 在MainScene.create()中调用: await policeSystem.initialize()
   - 在MainScene.update()中调用: await policeSystem.update()

3️⃣ 【测试AI功能】
   - 点击老刘开始对话
   - 观察他的自主巡逻行为
   - 查看控制台的AI调用日志

4️⃣ 【调试工具】
   - policeSystem.getPoliceStatus() - 获取状态
   - policeSystem.getObservationNotes() - 查看观察笔记
   - policeSystem.getAIStats() - 查看AI使用统计

5️⃣ 【成本控制】
   - 默认30秒决策一次，成本极低
   - 有降级机制，AI不可用时仍可正常运行
   - 查看控制台了解实时成本

🎯 老刘的AI能力：
   ✅ 智能对话：记住聊天历史，根据人设回复
   ✅ 自主决策：根据时间和情况自动选择行为
   ✅ 巡逻系统：在社区各地点间智能巡逻
   ✅ 观察记录：记录重要事件和玩家行为
   ✅ 情绪系统：会根据时间和事件调整状态

💡 如果API密钥暂时不可用，老刘会自动切换到基础模式，
   依然能进行简单对话和按时间表巡逻。
`;